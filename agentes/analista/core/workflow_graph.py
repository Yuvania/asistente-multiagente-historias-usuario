"""LangGraph workflow with Analyst business interrupts and a bounded writer loop."""
from __future__ import annotations

from collections.abc import Awaitable, Callable, Mapping
from typing import Any
from uuid import UUID, uuid4

from langgraph.checkpoint.memory import InMemorySaver
from langgraph.graph import END, START, StateGraph
from langgraph.types import Command, interrupt

from agentes.analista.core.agent_registry import AgentId
from agentes.analista.core.conversation_store import ConversationStore
from agentes.analista.core.models import AgentTurnResponse, SendMessageRequest, QuestionState
from agentes.analista.core.observability import Observability
from agentes.analista.core.prompt_loader import load_prompt
from agentes.analista.core.redactor_revisor import RedactorRevisor
from agentes.analista.core.technical_advisor import TechnicalAdvisor
from agentes.analista.core.workflow_models import (
    BusinessAnswerSubmission,
    DraftStory,
    FlowMode,
    StoryDraftContent,
    StoryReviewOutput,
    TechnicalAssessment,
    WorkflowCreateRequest,
    WorkflowSnapshot,
    WorkflowStage,
    WorkflowState,
    WorkflowStatus,
    ReviewStatus,
)


AnalystNode = Callable[[WorkflowState], Awaitable[AgentTurnResponse | Mapping[str, Any]]]
DraftNode = Callable[[WorkflowState], Awaitable[StoryDraftContent | Mapping[str, Any]]]
ReviewNode = Callable[[WorkflowState], Awaitable[StoryReviewOutput | Mapping[str, Any]]]
TechnicalAdvisorNode = Callable[[WorkflowState], Awaitable[TechnicalAssessment | Mapping[str, Any]]]


class WorkflowNotFoundError(LookupError):
    """The workflow has no checkpoint in this process."""


class WorkflowNotInterruptedError(RuntimeError):
    """A resume was attempted while the workflow was not waiting for Business."""


def _public_snapshot(state: Mapping[str, Any]) -> WorkflowSnapshot:
    allowed = {
        "workflow_id", "mode", "status", "current_stage", "active_agent",
        "pending_questions", "analyst_response", "draft_story", "review_observations",
        "technical_assessment", "completion_reason",
    }
    return WorkflowSnapshot.model_validate({key: value for key, value in state.items() if key in allowed})


def _trace_stage(
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
        kind="chain", name="workflow-stage", metadata={"stage": stage.value, "agent_id": agent.value}
    )
    operation.finish(status="ready", metadata={"stage": stage.value, "agent_id": agent.value})
    trace.finish(status="ready", metadata={"stage": stage.value, "agent_id": agent.value})


def build_workflow_graph(
    *,
    checkpointer: InMemorySaver | None = None,
    observability: Observability | None = None,
    analyst: AnalystNode | None = None,
    draft: DraftNode | None = None,
    review: ReviewNode | None = None,
    advisor: TechnicalAdvisorNode | None = None,
):
    """Compile pre-grooming orchestration; callbacks keep model and store access injectable."""
    writer = RedactorRevisor()
    technical_advisor = TechnicalAdvisor()

    async def call_analyst(state: WorkflowState) -> AgentTurnResponse | Mapping[str, Any]:
        if analyst is None:
            raise RuntimeError("El nodo Analista requiere el adaptador de run_turn.")
        return await analyst(state)

    async def call_draft(state: WorkflowState) -> StoryDraftContent | Mapping[str, Any]:
        if draft is not None:
            return await draft(state)
        return await writer.draft(
            requirement=state["requirement_input"] or "",
            analyst_response=state["analyst_response"],
            previous_story=state.get("draft_story"),
            observations=state.get("review_observations", []),
        )

    async def call_review(state: WorkflowState) -> StoryReviewOutput | Mapping[str, Any]:
        if review is not None:
            return await review(state)
        return await writer.review(
            requirement=state["requirement_input"] or "",
            analyst_response=state["analyst_response"],
            story=state["draft_story"],
        )

    async def call_advisor(state: WorkflowState) -> TechnicalAssessment | Mapping[str, Any]:
        if advisor is not None:
            return await advisor(state)
        return await technical_advisor.assess(
            requirement=state.get("requirement_input") or "",
            story=state.get("draft_story", {}),
        )

    def prepare_pre_grooming(state: WorkflowState) -> dict[str, Any]:
        if FlowMode(state["mode"]) != FlowMode.PRE_GROOMING:
            raise ValueError("El modo no corresponde al nodo pre_grooming.")
        stage, agent = WorkflowStage.ANALYST, AgentId.ANALYST
        _trace_stage(observability, state, stage=stage, agent=agent)
        return {"current_stage": stage, "active_agent": agent, "status": WorkflowStatus.READY}

    def prepare_post_grooming(state: WorkflowState) -> dict[str, Any]:
        if FlowMode(state["mode"]) != FlowMode.POST_GROOMING:
            raise ValueError("El modo no corresponde al nodo post_grooming.")
        stage, agent = WorkflowStage.CHANGE_MANAGER, AgentId.CHANGE_MANAGER
        _trace_stage(observability, state, stage=stage, agent=agent)
        return {"current_stage": stage, "active_agent": agent, "status": WorkflowStatus.READY}

    async def analyst_node(state: WorkflowState) -> dict[str, Any]:
        response = AgentTurnResponse.model_validate(await call_analyst(state))
        pending = [question.model_dump(mode="json") for question in response.preguntas
                   if question.estado == QuestionState.PENDING]
        ready = response.listo_para_redactor and not pending
        if pending:
            stage, agent, status = WorkflowStage.BUSINESS_WAIT, AgentId.ANALYST, WorkflowStatus.INTERRUPTED
        elif ready:
            stage, agent, status = WorkflowStage.WRITER, AgentId.WRITER_REVIEWER, WorkflowStatus.RUNNING
        else:
            # Fail closed: without an open question there is no valid Business interrupt to resume.
            stage, agent, status = WorkflowStage.ANALYST, AgentId.ANALYST, WorkflowStatus.FAILED
        _trace_stage(observability, state, stage=WorkflowStage.ANALYST, agent=AgentId.ANALYST)
        return {
            "analyst_response": response.model_dump(mode="json"),
            "analyst_ready": ready,
            "pending_questions": pending,
            "current_stage": stage,
            "active_agent": agent,
            "status": status,
            "completion_reason": None if ready or pending else "El Analista reportó vacíos sin preguntas pendientes.",
        }

    def wait_for_business(state: WorkflowState) -> dict[str, Any]:
        payload = {
            "kind": "business_answers",
            "questions": state.get("pending_questions", []),
            "max_answer_chars": 1000,
            "max_total_chars": 3500,
        }
        raw_answers = interrupt(payload)
        answers = BusinessAnswerSubmission.model_validate(raw_answers)
        allowed_ids = {item["question_id"] for item in state.get("pending_questions", [])}
        supplied_ids = {item.question_id for item in answers.answers}
        if not supplied_ids or not supplied_ids <= allowed_ids:
            raise ValueError("La respuesta incluye preguntas que no están pendientes en este workflow.")
        _trace_stage(observability, state, stage=WorkflowStage.BUSINESS_WAIT, agent=AgentId.ANALYST)
        return {
            "latest_business_answers": [item.model_dump(mode="json") for item in answers.answers],
            "current_stage": WorkflowStage.ANALYST,
            "active_agent": AgentId.ANALYST,
            "status": WorkflowStatus.RUNNING,
        }

    async def writer_node(state: WorkflowState) -> dict[str, Any]:
        content = StoryDraftContent.model_validate(await call_draft(state))
        previous = DraftStory.model_validate(state["draft_story"]) if state.get("draft_story") else None
        round_number = (previous.review_round + 1) if previous else 0
        story = DraftStory(
            **content.model_dump(),
            review_status=ReviewStatus.DRAFT,
            review_round=round_number,
            observations=state.get("review_observations", []),
        )
        _trace_stage(observability, state, stage=WorkflowStage.WRITER, agent=AgentId.WRITER_REVIEWER)
        return {
            "draft_story": story.model_dump(mode="json"),
            "current_stage": WorkflowStage.REVIEW,
            "active_agent": AgentId.WRITER_REVIEWER,
            "status": WorkflowStatus.RUNNING,
        }

    async def reviewer_node(state: WorkflowState) -> dict[str, Any]:
        result = StoryReviewOutput.model_validate(await call_review(state))
        story = DraftStory.model_validate(state["draft_story"])
        observations = (story.observations + result.observations)[-20:]
        at_limit = story.review_round >= 2
        needs_attention = result.requires_correction and at_limit
        status = (
            ReviewStatus.NEEDS_ATTENTION if needs_attention else
            ReviewStatus.DRAFT if result.requires_correction else ReviewStatus.REVIEWED
        )
        revised_story = story.model_copy(update={"review_status": status, "observations": observations})
        should_correct = result.requires_correction and not at_limit
        stage = WorkflowStage.WRITER if should_correct else WorkflowStage.TECHNICAL_ADVISOR
        workflow_status = WorkflowStatus.RUNNING if should_correct else WorkflowStatus.READY
        _trace_stage(observability, state, stage=WorkflowStage.REVIEW, agent=AgentId.WRITER_REVIEWER)
        return {
            "draft_story": revised_story.model_dump(mode="json"),
            "review_observations": observations,
            "review_requires_correction": should_correct,
            "completion_reason": "La revisión agotó dos rondas; requiere revisión del PO." if needs_attention else None,
            "current_stage": stage,
            "active_agent": AgentId.WRITER_REVIEWER if should_correct else AgentId.TECHNICAL_ADVISOR,
            "status": workflow_status,
        }

    async def technical_advisor_node(state: WorkflowState) -> dict[str, Any]:
        assessment = TechnicalAssessment.model_validate(await call_advisor(state))
        _trace_stage(observability, state, stage=WorkflowStage.TECHNICAL_ADVISOR,
                     agent=AgentId.TECHNICAL_ADVISOR)
        return {
            "technical_assessment": assessment.model_dump(mode="json"),
            "current_stage": WorkflowStage.PO_APPROVAL,
            "active_agent": AgentId.TECHNICAL_ADVISOR,
            "status": WorkflowStatus.READY,
        }

    def hold_for_unresolved_gaps(state: WorkflowState) -> dict[str, Any]:
        _trace_stage(observability, state, stage=WorkflowStage.ANALYST, agent=AgentId.ANALYST)
        return {"current_stage": WorkflowStage.ANALYST, "status": WorkflowStatus.FAILED}

    builder = StateGraph(WorkflowState)
    builder.add_node("prepare_pre_grooming", prepare_pre_grooming)
    builder.add_node("prepare_post_grooming", prepare_post_grooming)
    builder.add_node("analyst", analyst_node)
    builder.add_node("business_wait", wait_for_business)
    builder.add_node("writer", writer_node)
    builder.add_node("reviewer", reviewer_node)
    builder.add_node("technical_advisor", technical_advisor_node)
    builder.add_node("hold_for_unresolved_gaps", hold_for_unresolved_gaps)
    builder.add_conditional_edges(
        START,
        lambda state: FlowMode(state["mode"]).value,
        {
            FlowMode.PRE_GROOMING.value: "prepare_pre_grooming",
            FlowMode.POST_GROOMING.value: "prepare_post_grooming",
        },
    )
    builder.add_conditional_edges(
        "prepare_pre_grooming",
        lambda state: "analyst" if state.get("execute_agents") else END,
        {"analyst": "analyst", END: END},
    )
    builder.add_edge("prepare_post_grooming", END)
    builder.add_conditional_edges(
        "analyst",
        lambda state: (
            "business_wait" if state.get("pending_questions") else
            "writer" if state.get("analyst_ready") else "hold_for_unresolved_gaps"
        ),
        {"business_wait": "business_wait", "writer": "writer", "hold_for_unresolved_gaps": "hold_for_unresolved_gaps"},
    )
    builder.add_edge("business_wait", "analyst")
    builder.add_edge("writer", "reviewer")
    builder.add_conditional_edges(
        "reviewer",
        lambda state: "writer" if state.get("review_requires_correction") else "technical_advisor",
        {"writer": "writer", "technical_advisor": "technical_advisor"},
    )
    builder.add_edge("technical_advisor", END)
    builder.add_edge("hold_for_unresolved_gaps", END)
    return builder.compile(checkpointer=checkpointer or InMemorySaver())


class WorkflowRuntime:
    """Own graph checkpoints, Analyst conversations, and private thread IDs per process."""

    def __init__(
        self,
        observability: Observability | None = None,
        *,
        analyst: AnalystNode | None = None,
        draft: DraftNode | None = None,
        review: ReviewNode | None = None,
        advisor: TechnicalAdvisorNode | None = None,
    ) -> None:
        self.observability = observability or Observability()
        self._checkpointer = InMemorySaver()
        self._threads: dict[UUID, str] = {}
        self._conversation_ids: dict[UUID, UUID] = {}
        self._injected_analyst = analyst
        prompt = load_prompt()
        self._analyst_store = ConversationStore(
            prompt_version=prompt.version,
            prompt_hash=prompt.sha256,
            ttl_seconds=1800,
            max_conversations=32,
        )
        self._graph = build_workflow_graph(
            checkpointer=self._checkpointer,
            observability=self.observability,
            analyst=self._run_analyst if analyst is None else analyst,
            draft=draft,
            review=review,
            advisor=advisor,
        )

    @property
    def active_thread_count(self) -> int:
        return len(self._threads)

    def _thread_config(self, workflow_id: UUID) -> dict[str, Any]:
        return {"configurable": {"thread_id": self._threads[workflow_id]}}

    def _register(self) -> UUID:
        workflow_id = uuid4()
        thread_id = uuid4().hex
        self._threads[workflow_id] = thread_id
        return workflow_id

    def start(self, request: WorkflowCreateRequest) -> WorkflowSnapshot:
        """Validate and checkpoint the selected initial role without executing agents."""
        request = WorkflowCreateRequest.model_validate(request)
        workflow_id = self._register()
        try:
            state = request.to_graph_state(workflow_id)
            state["execute_agents"] = False
            result = self._graph.invoke(state, config=self._thread_config(workflow_id))
            return _public_snapshot(result)
        except Exception:
            self._threads.pop(workflow_id, None)
            raise

    async def execute(self, request: WorkflowCreateRequest) -> WorkflowSnapshot:
        """Run pre-grooming through Analyst, Business interrupt, and writer/reviewer nodes."""
        request = WorkflowCreateRequest.model_validate(request)
        workflow_id = self._register()
        try:
            if self._injected_analyst is None and request.mode == FlowMode.PRE_GROOMING:
                conversation = await self._analyst_store.create()
                self._conversation_ids[workflow_id] = conversation.conversation_id
            state = request.to_graph_state(workflow_id)
            state["execute_agents"] = True
            result = await self._graph.ainvoke(state, config=self._thread_config(workflow_id))
            return _public_snapshot(result)
        except Exception:
            if self._injected_analyst is None:
                conversation_id_forget = self._conversation_ids.pop(workflow_id, None)
                if conversation_id_forget is not None:
                    await self._analyst_store.delete(conversation_id_forget)
            self._threads.pop(workflow_id, None)
            raise

    async def _run_analyst(self, state: WorkflowState) -> AgentTurnResponse:
        from agentes.analista.core.orchestrator import run_turn

        workflow_id = UUID(state["workflow_id"])
        conversation_id = self._conversation_ids[workflow_id]
        answers = state.get("latest_business_answers", [])
        if answers:
            message = "Respuestas de Negocio a preguntas pendientes:\n" + "\n".join(
                f"{item['question_id']}: {item['answer']}" for item in answers
            )
        else:
            message = state["requirement_input"] or ""
        request = SendMessageRequest(request_id=uuid4(), message=message)
        return await run_turn(self._analyst_store, conversation_id, request, observability=self.observability)

    async def resume(
        self,
        workflow_id: UUID | str,
        answers: BusinessAnswerSubmission | Mapping[str, Any],
    ) -> WorkflowSnapshot:
        """Resume the Business interrupt using LangGraph's Command(resume=...)."""
        identifier = self._resolve_workflow_id(workflow_id)
        submission = BusinessAnswerSubmission.model_validate(answers)
        current = self._graph.get_state(self._thread_config(identifier))
        if not any(getattr(task, "interrupts", ()) for task in current.tasks):
            raise WorkflowNotInterruptedError("El workflow no está esperando respuestas de Negocio.")
        result = await self._graph.ainvoke(
            Command(resume=submission.model_dump(mode="json")),
            config=self._thread_config(identifier),
        )
        return _public_snapshot(result)

    def _resolve_workflow_id(self, workflow_id: UUID | str) -> UUID:
        try:
            identifier = workflow_id if isinstance(workflow_id, UUID) else UUID(str(workflow_id))
            if identifier not in self._threads:
                raise KeyError(identifier)
            return identifier
        except (ValueError, KeyError) as exc:
            raise WorkflowNotFoundError("El workflow no existe en este proceso.") from exc

    def get(self, workflow_id: UUID | str) -> WorkflowSnapshot:
        """Read the latest safe checkpoint while its owning process is alive."""
        identifier = self._resolve_workflow_id(workflow_id)
        snapshot = self._graph.get_state(self._thread_config(identifier))
        if not snapshot.values:
            raise WorkflowNotFoundError("El workflow no existe en este proceso.")
        return _public_snapshot(snapshot.values)
