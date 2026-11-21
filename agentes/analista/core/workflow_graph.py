"""Compiled LangGraph foundation with process-local checkpoints."""
from __future__ import annotations

from typing import Any
from uuid import UUID, uuid4

from langgraph.checkpoint.memory import InMemorySaver
from langgraph.graph import END, START, StateGraph

from agentes.analista.core.agent_registry import AgentId
from agentes.analista.core.observability import Observability
from agentes.analista.core.workflow_models import (
    FlowMode,
    WorkflowCreateRequest,
    WorkflowSnapshot,
    WorkflowStage,
    WorkflowState,
    WorkflowStatus,
)


class WorkflowNotFoundError(LookupError):
    """The workflow has no checkpoint in this process."""


def _public_snapshot(state: dict[str, Any]) -> WorkflowSnapshot:
    allowed = {"workflow_id", "mode", "status", "current_stage", "active_agent"}
    return WorkflowSnapshot.model_validate({key: value for key, value in state.items() if key in allowed})


def _trace_route(
    observability: Observability | None,
    state: WorkflowState,
    *,
    stage: WorkflowStage,
    agent: AgentId,
) -> None:
    if observability is None:
        return
    trace = observability.start_turn(
        conversation_id=state.get("workflow_id", "unknown"),
        request_id=state.get("request_id", "unknown"),
        turn_id=state.get("workflow_id", "unknown"),
    )
    operation = trace.operation(
        kind="chain",
        name="workflow-select-agent",
        metadata={"stage": stage.value, "agent_id": agent.value},
    )
    operation.finish(status="ready", metadata={"stage": stage.value, "agent_id": agent.value})
    trace.finish(status="ready", metadata={"stage": stage.value, "agent_id": agent.value})


def build_workflow_graph(
    *,
    checkpointer: InMemorySaver | None = None,
    observability: Observability | None = None,
):
    """Compile an explicit mode router; it prepares, but does not run, an agent."""
    builder = StateGraph(WorkflowState)

    def prepare_pre_grooming(state: WorkflowState) -> dict[str, Any]:
        if FlowMode(state["mode"]) != FlowMode.PRE_GROOMING:
            raise ValueError("El modo no corresponde al nodo pre_grooming.")
        stage, agent = WorkflowStage.ANALYST, AgentId.ANALYST
        _trace_route(observability, state, stage=stage, agent=agent)
        return {"current_stage": stage, "active_agent": agent, "status": WorkflowStatus.READY}

    def prepare_post_grooming(state: WorkflowState) -> dict[str, Any]:
        if FlowMode(state["mode"]) != FlowMode.POST_GROOMING:
            raise ValueError("El modo no corresponde al nodo post_grooming.")
        stage, agent = WorkflowStage.CHANGE_MANAGER, AgentId.CHANGE_MANAGER
        _trace_route(observability, state, stage=stage, agent=agent)
        return {"current_stage": stage, "active_agent": agent, "status": WorkflowStatus.READY}

    builder.add_node("prepare_pre_grooming", prepare_pre_grooming)
    builder.add_node("prepare_post_grooming", prepare_post_grooming)
    builder.add_conditional_edges(
        START,
        lambda state: FlowMode(state["mode"]).value,
        {
            FlowMode.PRE_GROOMING.value: "prepare_pre_grooming",
            FlowMode.POST_GROOMING.value: "prepare_post_grooming",
        },
    )
    builder.add_edge("prepare_pre_grooming", END)
    builder.add_edge("prepare_post_grooming", END)
    return builder.compile(checkpointer=checkpointer or InMemorySaver())


class WorkflowRuntime:
    """Own the compiled graph and its thread IDs for this process lifetime."""

    def __init__(self, observability: Observability | None = None) -> None:
        self.observability = observability or Observability()
        self._checkpointer = InMemorySaver()
        self._graph = build_workflow_graph(
            checkpointer=self._checkpointer,
            observability=self.observability,
        )
        self._threads: dict[UUID, str] = {}

    @property
    def active_thread_count(self) -> int:
        return len(self._threads)

    def start(self, request: WorkflowCreateRequest) -> WorkflowSnapshot:
        """Validate, route and checkpoint the initial workflow in memory."""
        request = WorkflowCreateRequest.model_validate(request)
        workflow_id = uuid4()
        thread_id = uuid4().hex
        config = {"configurable": {"thread_id": thread_id}}
        self._threads[workflow_id] = thread_id
        try:
            state = self._graph.invoke(request.to_graph_state(workflow_id), config=config)
            return _public_snapshot(state)
        except Exception:
            self._threads.pop(workflow_id, None)
            raise

    def get(self, workflow_id: UUID | str) -> WorkflowSnapshot:
        """Read the latest checkpoint only while its owning process is alive."""
        try:
            identifier = workflow_id if isinstance(workflow_id, UUID) else UUID(str(workflow_id))
            thread_id = self._threads[identifier]
        except (ValueError, KeyError) as exc:
            raise WorkflowNotFoundError("El workflow no existe en este proceso.") from exc
        snapshot = self._graph.get_state({"configurable": {"thread_id": thread_id}})
        if not snapshot.values:
            raise WorkflowNotFoundError("El workflow no existe en este proceso.")
        return _public_snapshot(snapshot.values)
