"""Typed contracts for the in-memory multi-agent workflow foundation."""
from __future__ import annotations

from enum import StrEnum
from typing import TypedDict
from uuid import UUID, uuid4

from pydantic import BaseModel, ConfigDict, Field, UUID4, field_validator, model_validator

from agentes.analista.core.agent_registry import AgentId
from agentes.analista.core.models import AgentTurnResponse, Question


class FlowMode(StrEnum):
    PRE_GROOMING = "pre_grooming"
    POST_GROOMING = "post_grooming"


class WorkflowStage(StrEnum):
    ANALYST = "analista"
    BUSINESS_WAIT = "espera_negocio"
    WRITER = "redactor"
    REVIEW = "revision"
    TECHNICAL_ADVISOR = "asesor_tecnico"
    PO_APPROVAL = "aprobacion_po"
    REPOSITORY = "repositorio"
    CHANGE_MANAGER = "gestor_cambios"
    HUMAN_DECISION = "decision_humana"
    APPLY_DECISION = "aplicar_decision"


class WorkflowStatus(StrEnum):
    READY = "ready"
    RUNNING = "running"
    INTERRUPTED = "interrupted"
    COMPLETED = "completed"
    FAILED = "failed"
    CANCELLED = "cancelled"


class ReviewStatus(StrEnum):
    DRAFT = "draft"
    REVIEWED = "reviewed"
    NEEDS_ATTENTION = "needs_attention"


class ChangeKind(StrEnum):
    CLARIFICATION = "aclaracion"
    SCOPE_CHANGE = "cambio_alcance"


class AcceptanceCriterion(BaseModel):
    model_config = ConfigDict(extra="forbid", str_strip_whitespace=True)

    dado: str = Field(min_length=1, max_length=1000)
    cuando: str = Field(min_length=1, max_length=1000)
    entonces: str = Field(min_length=1, max_length=1000)


class DraftStory(BaseModel):
    """Agent-authored HU; deliberately has no approval/decision field."""

    model_config = ConfigDict(extra="forbid", str_strip_whitespace=True)

    como: str = Field(min_length=1, max_length=500)
    quiero: str = Field(min_length=1, max_length=1000)
    para: str = Field(min_length=1, max_length=1000)
    criterios: list[AcceptanceCriterion] = Field(min_length=1, max_length=30)
    review_status: ReviewStatus = ReviewStatus.DRAFT
    review_round: int = Field(default=0, ge=0, le=2)
    observations: list[str] = Field(default_factory=list, max_length=20)


class StoryDraftContent(BaseModel):
    """Only the writer-authored story content; review state stays backend-owned."""

    model_config = ConfigDict(extra="forbid", str_strip_whitespace=True)

    como: str = Field(min_length=1, max_length=500)
    quiero: str = Field(min_length=1, max_length=1000)
    para: str = Field(min_length=1, max_length=1000)
    criterios: list[AcceptanceCriterion] = Field(min_length=1, max_length=30)


class StoryReviewOutput(BaseModel):
    """Structured quality feedback; it deliberately has no approval field."""

    model_config = ConfigDict(extra="forbid", str_strip_whitespace=True)

    requires_correction: bool
    observations: list[str] = Field(default_factory=list, max_length=20)

    @field_validator("observations")
    @classmethod
    def validate_observations(cls, items: list[str]) -> list[str]:
        if any(not item.strip() or len(item) > 1000 for item in items):
            raise ValueError("Cada observación debe tener entre 1 y 1.000 caracteres.")
        return [item.strip() for item in items]

    @model_validator(mode="after")
    def require_feedback_for_correction(self) -> "StoryReviewOutput":
        if self.requires_correction and not self.observations:
            raise ValueError("Una corrección requiere al menos una observación concreta.")
        return self


class BusinessAnswer(BaseModel):
    model_config = ConfigDict(extra="forbid", str_strip_whitespace=True)

    question_id: str = Field(min_length=1, max_length=80)
    answer: str = Field(min_length=1, max_length=1000)


class BusinessAnswerSubmission(BaseModel):
    model_config = ConfigDict(extra="forbid")

    answers: list[BusinessAnswer] = Field(min_length=1, max_length=50)

    @model_validator(mode="after")
    def validate_submission(self) -> "BusinessAnswerSubmission":
        ids = [item.question_id for item in self.answers]
        if len(ids) != len(set(ids)):
            raise ValueError("No se puede responder dos veces la misma pregunta.")
        if sum(len(item.answer) + len(item.question_id) + 4 for item in self.answers) > 3500:
            raise ValueError("Las respuestas exceden el límite total permitido.")
        return self


class EvidenceReference(BaseModel):
    model_config = ConfigDict(extra="forbid", str_strip_whitespace=True)

    source_id: str = Field(min_length=1, max_length=120)
    source_ref: str = Field(min_length=1, max_length=300)
    evidence: str = Field(min_length=1, max_length=1000)


class TechnicalAssessment(BaseModel):
    model_config = ConfigDict(extra="forbid")

    affected_modules: list[EvidenceReference] = Field(default_factory=list, max_length=30)
    risks: list[EvidenceReference] = Field(default_factory=list, max_length=30)
    critical_processes: list[EvidenceReference] = Field(default_factory=list, max_length=30)


class ChangeRecommendation(BaseModel):
    model_config = ConfigDict(extra="forbid", str_strip_whitespace=True)

    recommendation: ChangeKind
    rationale: str = Field(min_length=1, max_length=2000)
    evidence: list[EvidenceReference] = Field(default_factory=list, max_length=30)
    lessons_proposed: list[str] = Field(default_factory=list, max_length=20)


class WorkflowCreateRequest(BaseModel):
    model_config = ConfigDict(extra="forbid", str_strip_whitespace=True)

    request_id: UUID4 = Field(default_factory=uuid4)
    mode: FlowMode
    requirement: str | None = Field(default=None, min_length=1, max_length=4000)
    approved_story_id: str | None = Field(default=None, min_length=1, max_length=100)
    change_request: str | None = Field(default=None, min_length=1, max_length=2000)

    @model_validator(mode="after")
    def validate_mode_contract(self) -> "WorkflowCreateRequest":
        if self.mode == FlowMode.PRE_GROOMING:
            if not self.requirement or not self.requirement.strip():
                raise ValueError("pre_grooming requiere requirement no vacío.")
            if self.approved_story_id is not None or self.change_request is not None:
                raise ValueError("pre_grooming no admite datos de solicitud post-grooming.")
        else:
            if not self.approved_story_id or not self.change_request or not self.change_request.strip():
                raise ValueError("post_grooming requiere una HU aprobada y una solicitud de cambio.")
            if self.requirement is not None:
                raise ValueError("post_grooming no admite requirement.")
        return self

    def to_graph_state(self, workflow_id: UUID | None = None) -> "WorkflowState":
        """Create the small, serializable state passed to LangGraph."""
        state = WorkflowStateContract(
            workflow_id=workflow_id or uuid4(),
            request_id=self.request_id,
            mode=self.mode,
            requirement_input=self.requirement,
            approved_story_id=self.approved_story_id,
            change_request=self.change_request,
        )
        return state.model_dump(mode="json")  # type: ignore[return-value]


class WorkflowStateContract(BaseModel):
    """Pydantic serialization boundary for the LangGraph state."""

    model_config = ConfigDict(extra="forbid", str_strip_whitespace=True)

    workflow_id: UUID
    request_id: UUID4
    mode: FlowMode
    requirement_input: str | None = Field(default=None, min_length=1, max_length=4000)
    approved_story_id: str | None = Field(default=None, min_length=1, max_length=100)
    change_request: str | None = Field(default=None, min_length=1, max_length=2000)
    current_stage: WorkflowStage | None = None
    active_agent: AgentId | None = None
    status: WorkflowStatus = WorkflowStatus.READY

    @model_validator(mode="after")
    def validate_mode_contract(self) -> "WorkflowStateContract":
        if self.mode == FlowMode.PRE_GROOMING:
            if not self.requirement_input or self.approved_story_id is not None or self.change_request is not None:
                raise ValueError("El estado pre_grooming contiene un contrato de entrada inválido.")
        elif not self.approved_story_id or not self.change_request or self.requirement_input is not None:
            raise ValueError("El estado post_grooming contiene un contrato de entrada inválido.")
        return self


class WorkflowState(TypedDict, total=False):
    """LangGraph state; thread_id stays in LangGraph config, never in state."""

    workflow_id: str
    request_id: str
    mode: FlowMode
    requirement_input: str | None
    approved_story_id: str | None
    change_request: str | None
    current_stage: WorkflowStage
    active_agent: AgentId
    status: WorkflowStatus
    execute_agents: bool
    analyst_response: dict
    analyst_ready: bool
    pending_questions: list[dict]
    latest_business_answers: list[dict]
    draft_story: dict
    review_observations: list[str]
    completion_reason: str | None


class WorkflowSnapshot(BaseModel):
    """Publicly safe workflow state, without thread IDs or internal prompts."""

    model_config = ConfigDict(extra="forbid", frozen=True)

    workflow_id: UUID
    mode: FlowMode
    status: WorkflowStatus
    current_stage: WorkflowStage
    active_agent: AgentId
    pending_questions: list[Question] = Field(default_factory=list)
    analyst_response: AgentTurnResponse | None = None
    draft_story: DraftStory | None = None
    review_observations: list[str] = Field(default_factory=list)
    completion_reason: str | None = None

