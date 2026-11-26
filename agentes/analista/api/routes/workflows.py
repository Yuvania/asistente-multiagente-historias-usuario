"""Public HTTP boundary for the in-memory LangGraph workflows."""
from __future__ import annotations

import asyncio
import logging
from contextlib import asynccontextmanager
from typing import Annotated, Any, Literal
from uuid import UUID

from fastapi import APIRouter, Body, Request, status
from pydantic import BaseModel, ConfigDict, Field, ValidationError, model_validator

from agentes.analista.api.errors import WorkflowApiError
from agentes.equipo.gestor_cambios.gestor_cambios_service import ChangeManagerError
from agentes.analista.core.models import AgentTurnResponse, ErrorCode
from agentes.analista.core.opencode_client import OpenCodeClientError
from agentes.equipo.analista.analista_service import OrchestrationError
from agentes.equipo.redactor_revisor.redactor_revisor_service import WriterOutputError
from agentes.equipo.asesor_tecnico.asesor_tecnico_service import TechnicalAdvisorError, TechnicalAdvisorOutputError
from agentes.analista.core.workflow_graph import (
    WorkflowDependencyError,
    WorkflowNotFoundError,
    WorkflowNotInterruptedError,
    WorkflowRuntime,
)
from agentes.analista.core.workflow_models import (
    BusinessAnswerSubmission,
    ChangeDecisionSubmission,
    ChangePersistenceResult,
    ChangeRecommendation,
    DevolucionPO,
    DraftStory,
    FlowMode,
    ImpactDecisionAnswer,
    ImpactoNegocio,
    NotaHu,
    PersistenceResult,
    POApprovalSubmission,
    TechnicalAssessment,
    WorkflowCreateRequest,
    WorkflowSnapshot,
    WorkflowStage,
    WorkflowStatus,
)

router = APIRouter()


class BusinessAnswersResume(BaseModel):
    model_config = ConfigDict(extra="forbid")

    kind: Literal["business_answers"]
    interrupt_id: str = Field(min_length=1, max_length=120)
    response: BusinessAnswerSubmission


class POApprovalResume(BaseModel):
    model_config = ConfigDict(extra="forbid")

    kind: Literal["po_approval"]
    interrupt_id: str = Field(min_length=1, max_length=120)
    response: POApprovalSubmission


class ChangeDecisionResume(BaseModel):
    model_config = ConfigDict(extra="forbid")

    kind: Literal["change_decision"]
    interrupt_id: str = Field(min_length=1, max_length=120)
    response: ChangeDecisionSubmission


ResumeSubmission = Annotated[
    BusinessAnswersResume | POApprovalResume | ChangeDecisionResume,
    Field(discriminator="kind"),
]


class WorkflowResults(BaseModel):
    model_config = ConfigDict(extra="forbid")

    analyst: AgentTurnResponse | None = None
    story: DraftStory | None = None
    review_observations: list[str] = Field(default_factory=list)
    ultima_revision: list[str] = Field(default_factory=list)
    notas_hu: list[NotaHu] = Field(default_factory=list)
    devoluciones_po: list[DevolucionPO] = Field(default_factory=list)
    technical_assessment: TechnicalAssessment | None = None
    impact_decisions: list[ImpactDecisionAnswer] = Field(default_factory=list)
    po_decision: POApprovalSubmission | None = None
    persistence_result: PersistenceResult | None = None
    change_recommendation: ChangeRecommendation | None = None
    change_decision: ChangeDecisionSubmission | None = None
    change_persistence_result: ChangePersistenceResult | None = None
    completion_reason: str | None = None


class WorkflowInterruptPayload(BaseModel):
    """Whitelist of information intentionally presented for a human decision."""

    model_config = ConfigDict(extra="forbid")

    questions: list[dict[str, Any]] | None = None
    max_answer_chars: int | None = None
    max_total_chars: int | None = None
    story: DraftStory | None = None
    review_observations: list[str] | None = None
    ultima_revision: list[str] | None = None
    notas_hu: list[NotaHu] | None = None
    devoluciones_po: list[DevolucionPO] | None = None
    impacto_negocio: list[ImpactoNegocio] | None = None
    decisiones_impacto: list[ImpactDecisionAnswer] | None = None
    supuesto_validar_po: list[str] | None = None
    change_recommendation: ChangeRecommendation | None = None
    decisions: list[str] | None = None
    return_requires_reason: bool | None = None
    lesson_decisions: list[str] | None = None


class WorkflowInterrupt(BaseModel):
    model_config = ConfigDict(extra="forbid")

    interrupt_id: str = Field(min_length=1, max_length=120)
    kind: Literal["business_answers", "po_approval", "change_decision"]
    payload: WorkflowInterruptPayload
    response_schema: dict[str, Any]


class WorkflowGuardado(BaseModel):
    """Lo que hace falta para retomar el flujo: datos del formulario, respuestas sin enviar y estado."""

    model_config = ConfigDict(extra="forbid")

    titulo: str | None = None
    creado_por: str | None = None
    formulario: dict[str, str] = Field(default_factory=dict)
    borrador_respuestas: dict[str, str] = Field(default_factory=dict)
    estado: str | None = None
    reintentable: bool = False
    persistente: bool = False


class WorkflowApiResponse(BaseModel):
    model_config = ConfigDict(extra="forbid")

    workflow_id: UUID
    mode: FlowMode
    status: WorkflowStatus
    stage: WorkflowStage
    results: WorkflowResults
    interrupt: WorkflowInterrupt | None = None
    guardado: WorkflowGuardado | None = None


class WorkflowResumen(BaseModel):
    model_config = ConfigDict(extra="forbid")

    workflow_id: str
    modo: str
    titulo: str
    creado_por: str | None = None
    estado: str
    etapa: str
    espera: str | None = None
    creado_en: str
    actualizado_en: str


class BorradorRespuestas(BaseModel):
    model_config = ConfigDict(extra="forbid")

    respuestas: dict[str, str] = Field(default_factory=dict, max_length=60)

    @model_validator(mode="after")
    def validate_size(self) -> "BorradorRespuestas":
        if any(len(key) > 80 or len(value) > 1000 for key, value in self.respuestas.items()):
            raise ValueError("Cada respuesta guardada admite hasta 1.000 caracteres.")
        return self


def _runtime(request: Request) -> WorkflowRuntime:
    return request.app.state.workflow_runtime


@asynccontextmanager
async def _exclusive_operation(request: Request, workflow_id: UUID):
    guard: asyncio.Lock = request.app.state.workflow_operation_guard
    active: set[UUID] = request.app.state.workflow_active_operations
    async with guard:
        if workflow_id in active:
            raise WorkflowApiError(
                ErrorCode.WORKFLOW_NOT_WAITING,
                "Ya existe una operación activa para este workflow.",
                status_code=409,
                retryable=True,
            )
        active.add(workflow_id)
    try:
        yield
    finally:
        async with guard:
            active.discard(workflow_id)


def _interrupt_response(runtime: WorkflowRuntime, workflow_id: UUID) -> WorkflowInterrupt | None:
    active = runtime.pending_interrupt(workflow_id)
    if active is None:
        return None
    payload = active["payload"]
    internal_kind = payload.get("kind")
    kind_map = {"product_owner_approval": "po_approval"}
    kind = kind_map.get(internal_kind, internal_kind)
    public_payload = dict(payload)
    if kind == "change_decision" and "recommendation" in public_payload:
        public_payload["change_recommendation"] = public_payload.pop("recommendation")
    schema_map = {
        "business_answers": BusinessAnswerSubmission,
        "po_approval": POApprovalSubmission,
        "change_decision": ChangeDecisionSubmission,
    }
    schema = schema_map.get(kind)
    if schema is None:
        raise WorkflowApiError(
            ErrorCode.CONTRACT_INVALID,
            "El workflow generó una interrupción incompatible.",
            status_code=422,
        )
    try:
        safe_payload = WorkflowInterruptPayload.model_validate(
            {key: value for key, value in public_payload.items() if key != "kind"}
        )
    except ValidationError as exc:
        raise WorkflowApiError(
            ErrorCode.CONTRACT_INVALID,
            "El workflow generó una interrupción incompatible.",
            status_code=422,
        ) from exc
    return WorkflowInterrupt(
        interrupt_id=active["interrupt_id"],
        kind=kind,
        payload=safe_payload,
        response_schema=schema.model_json_schema(),
    )


def _serialize(runtime: WorkflowRuntime, snapshot: WorkflowSnapshot) -> WorkflowApiResponse:
    return WorkflowApiResponse(
        workflow_id=snapshot.workflow_id,
        mode=snapshot.mode,
        status=snapshot.status,
        stage=snapshot.current_stage,
        results=WorkflowResults(
            analyst=snapshot.analyst_response,
            story=snapshot.draft_story,
            review_observations=snapshot.review_observations,
            ultima_revision=snapshot.ultima_revision,
            notas_hu=snapshot.notas_hu,
            devoluciones_po=snapshot.devoluciones_po,
            technical_assessment=snapshot.technical_assessment,
            impact_decisions=snapshot.impact_decisions,
            po_decision=snapshot.po_decision,
            persistence_result=snapshot.persistence_result,
            change_recommendation=snapshot.change_recommendation,
            change_decision=snapshot.change_decision,
            change_persistence_result=snapshot.change_persistence_result,
            completion_reason=snapshot.completion_reason,
        ),
        interrupt=_interrupt_response(runtime, snapshot.workflow_id),
        guardado=_guardado(runtime, snapshot.workflow_id),
    )


def _guardado(runtime: WorkflowRuntime, workflow_id: UUID) -> WorkflowGuardado | None:
    meta = runtime.metadatos(workflow_id)
    return WorkflowGuardado(
        titulo=meta.get("titulo"), creado_por=meta.get("creado_por"),
        formulario=meta.get("formulario") or {}, borrador_respuestas=meta.get("borrador") or {},
        estado=meta.get("estado"), reintentable=bool(meta.get("reintentable")), persistente=runtime.persiste,
    )


logger = logging.getLogger(__name__)


def _describir_error(exc: BaseException) -> str:
    """Tipo y mensaje del error y de su causa, sin el contenido generado por el modelo."""
    partes = []
    actual: BaseException | None = exc
    while actual is not None and len(partes) < 4:
        if isinstance(actual, ValidationError):
            campo = "; ".join(
                f"{'.'.join(str(parte) for parte in item['loc'])}: {item['type']}"
                for item in actual.errors(include_input=False, include_url=False)[:5]
            )
            partes.append(f"{type(actual).__name__}({actual.title}: {campo})")
        else:
            partes.append(f"{type(actual).__name__}: {str(actual)[:200]}")
        actual = actual.__cause__
    return " <- ".join(partes)


def _translate_runtime_error(exc: Exception) -> WorkflowApiError:
    if isinstance(exc, WorkflowApiError):
        return exc
    logger.warning("Workflow detenido: %s", _describir_error(exc))
    if isinstance(exc, WorkflowNotFoundError):
        return WorkflowApiError(
            ErrorCode.WORKFLOW_NOT_FOUND,
            "El workflow no existe en este proceso o su checkpoint se perdió.",
            status_code=404,
        )
    if isinstance(exc, WorkflowNotInterruptedError):
        return WorkflowApiError(
            ErrorCode.WORKFLOW_NOT_WAITING,
            "El workflow no tiene una decisión pendiente para reanudar.",
            status_code=409,
        )
    if isinstance(exc, (TimeoutError, asyncio.TimeoutError)):
        return WorkflowApiError(
            ErrorCode.WORKFLOW_TIMEOUT,
            "El workflow superó el tiempo máximo de ejecución.",
            status_code=504,
            retryable=True,
        )
    if isinstance(exc, ValidationError):
        return WorkflowApiError(
            ErrorCode.CONTRACT_INVALID,
            "Una salida estructurada del workflow no cumple el contrato.",
            status_code=422,
        )
    if isinstance(exc, WorkflowDependencyError):
        return WorkflowApiError(
            ErrorCode.DEPENDENCY_UNAVAILABLE,
            "Una dependencia del workflow no está disponible.",
            status_code=503,
            retryable=True,
        )
    if isinstance(exc, OpenCodeClientError):
        if exc.code == ErrorCode.TURN_TIMEOUT.value:
            return _translate_runtime_error(TimeoutError())
        return WorkflowApiError(
            ErrorCode.DEPENDENCY_UNAVAILABLE,
            "Una dependencia del workflow no está disponible.",
            status_code=503,
            retryable=exc.retryable,
        )
    if isinstance(exc, TechnicalAdvisorError):
        return WorkflowApiError(
            ErrorCode.DEPENDENCY_UNAVAILABLE,
            "Una dependencia del workflow no está disponible.",
            status_code=503,
            retryable=True,
        )
    if isinstance(exc, (WriterOutputError, TechnicalAdvisorOutputError, ChangeManagerError)):
        return WorkflowApiError(
            ErrorCode.CONTRACT_INVALID,
            "Una salida estructurada del workflow no cumple el contrato.",
            status_code=422,
        )
    if isinstance(exc, OrchestrationError):
        if exc.code == ErrorCode.TURN_TIMEOUT:
            return _translate_runtime_error(TimeoutError())
        if exc.code == ErrorCode.AGENT_OUTPUT_INVALID:
            return WorkflowApiError(
                ErrorCode.CONTRACT_INVALID,
                "Una salida estructurada del workflow no cumple el contrato.",
                status_code=422,
            )
        return WorkflowApiError(
            ErrorCode.DEPENDENCY_UNAVAILABLE,
            "Una dependencia del workflow no está disponible.",
            status_code=503,
            retryable=True,
        )
    if isinstance(exc, (ConnectionError, OSError)):
        return WorkflowApiError(
            ErrorCode.DEPENDENCY_UNAVAILABLE,
            "Una dependencia del workflow no está disponible.",
            status_code=503,
            retryable=True,
        )
    if isinstance(exc, ValueError):
        return WorkflowApiError(
            ErrorCode.INVALID_INPUT,
            "La respuesta no coincide con la interrupción pendiente.",
            status_code=400,
        )
    return WorkflowApiError(
        ErrorCode.INTERNAL_ERROR,
        "No fue posible completar la operación del workflow.",
        status_code=500,
    )


def _expected_interrupt_kind(snapshot: WorkflowSnapshot) -> str | None:
    if snapshot.current_stage == WorkflowStage.BUSINESS_WAIT:
        return "business_answers"
    if snapshot.current_stage == WorkflowStage.PO_APPROVAL:
        return "po_approval"
    if snapshot.current_stage == WorkflowStage.HUMAN_DECISION:
        return "change_decision"
    return None


@router.get("", response_model=list[WorkflowResumen])
def list_workflows(request: Request) -> list[WorkflowResumen]:
    """Flujos guardados que se pueden retomar, del más reciente al más antiguo."""
    runtime = _runtime(request)
    try:
        return [WorkflowResumen(workflow_id=item.pop("id"), **item) for item in runtime.listar()]
    except Exception as exc:
        raise _translate_runtime_error(exc) from exc


@router.delete("/{workflow_id}", status_code=status.HTTP_204_NO_CONTENT)
def delete_workflow(workflow_id: UUID, request: Request) -> None:
    runtime = _runtime(request)
    try:
        runtime.descartar(workflow_id)
    except Exception as exc:
        raise _translate_runtime_error(exc) from exc


@router.put("/{workflow_id}/borrador", status_code=status.HTTP_204_NO_CONTENT)
def save_workflow_draft(workflow_id: UUID, body: BorradorRespuestas, request: Request) -> None:
    """Guarda respuestas escritas y todavía no enviadas, para terminarlas otro día."""
    runtime = _runtime(request)
    try:
        runtime.guardar_borrador(workflow_id, body.respuestas)
    except Exception as exc:
        raise _translate_runtime_error(exc) from exc


@router.post("/{workflow_id}/reintentar", response_model=WorkflowApiResponse)
async def retry_workflow(workflow_id: UUID, request: Request) -> WorkflowApiResponse:
    """Vuelve a ejecutar el paso que falló, desde el último punto guardado."""
    runtime = _runtime(request)
    async with _exclusive_operation(request, workflow_id):
        try:
            return _serialize(runtime, await runtime.reintentar(workflow_id))
        except Exception as exc:
            raise _translate_runtime_error(exc) from exc


@router.post("", response_model=WorkflowApiResponse, status_code=status.HTTP_201_CREATED)
async def create_workflow(body: WorkflowCreateRequest, request: Request) -> WorkflowApiResponse:
    runtime = _runtime(request)
    try:
        return _serialize(runtime, await runtime.execute(body))
    except Exception as exc:
        raise _translate_runtime_error(exc) from exc


@router.get("/{workflow_id}", response_model=WorkflowApiResponse)
def get_workflow(workflow_id: UUID, request: Request) -> WorkflowApiResponse:
    runtime = _runtime(request)
    try:
        return _serialize(runtime, runtime.get(workflow_id))
    except Exception as exc:
        raise _translate_runtime_error(exc) from exc


@router.post("/{workflow_id}/resume", response_model=WorkflowApiResponse)
async def resume_workflow(
    workflow_id: UUID,
    request: Request,
    body: Annotated[ResumeSubmission, Body()],
) -> WorkflowApiResponse:
    runtime = _runtime(request)
    async with _exclusive_operation(request, workflow_id):
        try:
            snapshot = runtime.get(workflow_id)
            expected_kind = _expected_interrupt_kind(snapshot)
            active = runtime.pending_interrupt(workflow_id)
            if expected_kind is None or active is None:
                raise WorkflowNotInterruptedError("No hay interrupción pendiente.")
            internal_kind = active["payload"].get("kind")
            kind = {"product_owner_approval": "po_approval"}.get(internal_kind, internal_kind)
            if kind != expected_kind or kind != body.kind or active["interrupt_id"] != body.interrupt_id:
                raise WorkflowNotInterruptedError("La respuesta no corresponde a la interrupción pendiente.")
            updated = await runtime.resume(workflow_id, body.response)
            return _serialize(runtime, updated)
        except Exception as exc:
            raise _translate_runtime_error(exc) from exc
