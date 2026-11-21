"""Public HTTP boundary for the in-memory LangGraph workflows."""
from __future__ import annotations

import asyncio
from contextlib import asynccontextmanager
from typing import Annotated, Any, Literal
from uuid import UUID

from fastapi import APIRouter, Body, Request, status
from pydantic import BaseModel, ConfigDict, Field, ValidationError

from agentes.analista.api.errors import WorkflowApiError
from agentes.analista.core.change_manager import ChangeManagerError
from agentes.analista.core.models import AgentTurnResponse, ErrorCode
from agentes.analista.core.opencode_client import OpenCodeClientError
from agentes.analista.core.orchestrator import OrchestrationError
from agentes.analista.core.redactor_revisor import WriterOutputError
from agentes.analista.core.technical_advisor import TechnicalAdvisorError, TechnicalAdvisorOutputError
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
    DraftStory,
    FlowMode,
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
    technical_assessment: TechnicalAssessment | None = None
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
    technical_assessment: TechnicalAssessment | None = None
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


class WorkflowApiResponse(BaseModel):
    model_config = ConfigDict(extra="forbid")

    workflow_id: UUID
    mode: FlowMode
    status: WorkflowStatus
    stage: WorkflowStage
    results: WorkflowResults
    interrupt: WorkflowInterrupt | None = None


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
            technical_assessment=snapshot.technical_assessment,
            po_decision=snapshot.po_decision,
            persistence_result=snapshot.persistence_result,
            change_recommendation=snapshot.change_recommendation,
            change_decision=snapshot.change_decision,
            change_persistence_result=snapshot.change_persistence_result,
            completion_reason=snapshot.completion_reason,
        ),
        interrupt=_interrupt_response(runtime, snapshot.workflow_id),
    )


def _translate_runtime_error(exc: Exception) -> WorkflowApiError:
    if isinstance(exc, WorkflowApiError):
        return exc
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
