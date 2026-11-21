from agentes.analista.core.agent_registry import AgentId, allowed_mcp_tools
from agentes.analista.core.workflow_graph import WorkflowRuntime
from agentes.analista.core.workflow_models import FlowMode, WorkflowCreateRequest


def test_checkpoints_route_each_flow_without_sharing_private_inputs():
    runtime = WorkflowRuntime()
    analyst = runtime.start(
        WorkflowCreateRequest(mode=FlowMode.PRE_GROOMING, requirement="Información del Analista")
    )
    change = runtime.start(
        WorkflowCreateRequest(
            mode=FlowMode.POST_GROOMING,
            approved_story_id="HU-314",
            change_request="Información del Gestor",
        )
    )

    analyst_checkpoint = runtime.get(analyst.workflow_id)
    change_checkpoint = runtime.get(change.workflow_id)
    assert analyst_checkpoint.active_agent == AgentId.ANALYST
    assert change_checkpoint.active_agent == AgentId.CHANGE_MANAGER
    assert "Información del Gestor" not in analyst_checkpoint.model_dump_json()
    assert "Información del Analista" not in change_checkpoint.model_dump_json()
    assert allowed_mcp_tools(analyst_checkpoint.active_agent).isdisjoint(
        allowed_mcp_tools(change_checkpoint.active_agent)
    )
