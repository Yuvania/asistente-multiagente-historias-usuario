from __future__ import annotations

from uuid import uuid4

import pytest

from agentes.analista.core import workflow_graph
from agentes.analista.core.agent_registry import AgentId
from agentes.analista.core.models import AgentTurnResponse, Analysis
from agentes.analista.core.workflow_graph import WorkflowRuntime
from agentes.analista.core.workflow_models import (
    ChangeRecommendation,
    FlowMode,
    WorkflowCreateRequest,
    WorkflowStage,
    WorkflowStatus,
)
from agentes.conocimiento.retrieval import KnowledgeSource, RetrievalResult


APPROVED_ID = "2f1b2fe5-ec30-4c67-8c46-93ae3dd75a99"


def _ready_analysis():
    return AgentTurnResponse(
        conversation_id=uuid4(), request_id=uuid4(), turn_id=uuid4(), estado="completado",
        respuesta_markdown="Análisis listo", analisis=Analysis(conocida=["consulta póliza"], faltante=[], supuesta=[], ambigua=[]),
        preguntas=[], fuentes_consultadas=[], listo_para_redactor=True, limitaciones=[], duracion_ms=1,
        prompt_version="1.0.0",
    )


async def _assessment(_state):
    return {
        "affected_modules": [], "dependencies": [], "risks": [], "critical_processes": [],
        "consulted_sources": [], "uncertainties": ["prueba aislada"],
    }


def _result(namespace):
    return RetrievalResult(
        status="degraded", backend="local", namespace=namespace,
        sources=[KnowledgeSource(
            source_id=f"src-{namespace}", source_kind="simulated_fixture",
            source_ref=f"agentes/analista/fuentes/{namespace}.json#src-{namespace}",
            namespace=namespace, chunk=0, score=0.5, backend="local",
            citation=f"agentes/analista/fuentes/{namespace}.json#src-{namespace}",
            text="Evidencia no confiable de prueba.",
        )],
    )


class RetrieverSpy:
    def __init__(self):
        self.calls = []

    def search(self, *, agent_role, query, namespace, limit):
        self.calls.append((agent_role, namespace, query, limit))
        return _result(namespace)


@pytest.mark.asyncio
async def test_redactor_receives_standards_checklist_and_authorized_reference_evidence(monkeypatch):
    captured = []

    class Writer:
        async def draft(self, **kwargs):
            captured.append(("draft", kwargs["knowledge_context"]))
            return {
                "como": "persona usuaria", "quiero": "consultar póliza", "para": "ver vigencia",
                "criterios": [{"dado": "póliza activa", "cuando": "consulto", "entonces": "veo vigencia"}],
            }

        async def review(self, **kwargs):
            captured.append(("review", kwargs["knowledge_context"]))
            return {"requires_correction": False, "observations": []}

    monkeypatch.setattr(workflow_graph, "RedactorRevisor", Writer)
    retriever = RetrieverSpy()

    async def analyst(_state):
        return _ready_analysis()

    runtime = WorkflowRuntime(
        analyst=analyst, advisor=_assessment, knowledge_retriever=retriever,
    )
    result = await runtime.execute(WorkflowCreateRequest(
        mode=FlowMode.PRE_GROOMING, requirement="Consultar vigencia de póliza",
    ))

    assert result.current_stage == WorkflowStage.PO_APPROVAL
    assert result.status == WorkflowStatus.INTERRUPTED
    assert len(captured) == 2
    assert all(len(context) == 3 for _, context in captured)
    assert {namespace for role, namespace, _query, _limit in retriever.calls} == {
        "estandares", "checklist", "hu_aprobadas",
    }
    assert all(role == AgentId.WRITER_REVIEWER for role, _namespace, _query, _limit in retriever.calls)
    assert all(source["backend"] == "local" for _, context in captured for entry in context for source in entry["sources"])


@pytest.mark.asyncio
async def test_change_manager_receives_only_approved_story_and_approved_lesson_namespaces(monkeypatch):
    captured = []

    class Repository:
        def obtener_hu(self, hu_id):
            assert hu_id == APPROVED_ID
            return {
                "id": APPROVED_ID, "titulo": "HU aprobada", "tipo_informacion": "HU",
                "requerimiento": "Consultar saldo", "historia": '{"asA":"persona","iWant":"saldo","soThat":"ver"}',
                "criterios": "[]", "aclaraciones": "[]", "aprobada_en": "2026-11-20T00:00:00+00:00",
            }

    class Manager:
        async def evaluate(self, **kwargs):
            captured.extend(kwargs["knowledge_context"])
            return ChangeRecommendation.model_validate({
                "recommendation": "aclaracion", "comparison": [{
                    "approved_excerpt": "Consultar saldo", "request_excerpt": "Consultar movimientos",
                    "explanation": "La solicitud requiere confirmar la diferencia.",
                }], "impact": ["requiere decisión humana"],
                "rationale": "Se requiere confirmar alcance.", "uncertainties": ["dato pendiente"],
                "lessons_proposed": [],
            })

    monkeypatch.setattr(workflow_graph, "ChangeManager", Manager)
    retriever = RetrieverSpy()
    runtime = WorkflowRuntime(repository=Repository(), knowledge_retriever=retriever)
    result = await runtime.execute(WorkflowCreateRequest(
        mode=FlowMode.POST_GROOMING, approved_story_id=APPROVED_ID,
        change_request="Consultar movimientos del mes",
    ))

    assert result.current_stage == WorkflowStage.HUMAN_DECISION
    assert result.status == WorkflowStatus.INTERRUPTED
    assert {namespace for role, namespace, _query, _limit in retriever.calls} == {"hu_aprobadas", "lecciones"}
    assert all(role == AgentId.CHANGE_MANAGER for role, _namespace, _query, _limit in retriever.calls)
    assert len(captured) == 2
    assert all(entry["backend"] == "local" for entry in captured)
    assert all(source["backend"] == "local" for entry in captured for source in entry["sources"])
