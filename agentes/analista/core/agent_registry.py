"""Registry for role prompts and backend-owned, read-only MCP permissions."""
from __future__ import annotations

from dataclasses import dataclass
from enum import StrEnum
from pathlib import Path
from typing import Final

from agentes.analista.core.prompt_loader import PromptSnapshot, load_prompt


PROMPTS_DIR: Final = Path(__file__).resolve().parents[1] / "prompts"


class AgentId(StrEnum):
    ANALYST = "analista"
    WRITER_REVIEWER = "redactor_revisor"
    TECHNICAL_ADVISOR = "asesor_tecnico"
    CHANGE_MANAGER = "gestor_cambios"


class KnowledgeNamespace(StrEnum):
    GLOSSARY = "glosario"
    STANDARDS = "estandares"
    CHECKLIST = "checklist"
    APPROVED_STORIES = "hu_aprobadas"
    LESSONS = "lecciones"
    CODE = "codigo"


class AgentPermissionError(PermissionError):
    """A role tried to use an unassigned MCP tool or knowledge namespace."""


@dataclass(frozen=True, slots=True)
class AgentSpec:
    agent_id: AgentId
    prompt_path: Path
    description: str

    @property
    def prompt(self) -> PromptSnapshot:
        return load_prompt(self.prompt_path)


AGENT_SPECS: Final[dict[AgentId, AgentSpec]] = {
    AgentId.ANALYST: AgentSpec(
        AgentId.ANALYST, PROMPTS_DIR / "sistema.md",
        "Análisis de vacíos de requerimientos; conserva el contrato actual del Analista.",
    ),
    AgentId.WRITER_REVIEWER: AgentSpec(
        AgentId.WRITER_REVIEWER, PROMPTS_DIR / "redactor_revisor.md",
        "Redacción y revisión acotada de historias de usuario; nunca aprueba.",
    ),
    AgentId.TECHNICAL_ADVISOR: AgentSpec(
        AgentId.TECHNICAL_ADVISOR, PROMPTS_DIR / "asesor_tecnico.md",
        "Análisis técnico basado en evidencia recuperada de fuentes permitidas.",
    ),
    AgentId.CHANGE_MANAGER: AgentSpec(
        AgentId.CHANGE_MANAGER, PROMPTS_DIR / "gestor_cambios.md",
        "Clasificación y recomendación de cambios; nunca toma la decisión humana.",
    ),
}

# Tool permissions are backend-owned and scoped to each role-specific MCP server.
# Cada agente solo ve en su servidor MCP las herramientas de esta lista (mínimo privilegio).
MCP_TOOL_ALLOWLIST: Final[dict[AgentId, frozenset[str]]] = {
    AgentId.ANALYST: frozenset({
        "consultar_glosario", "buscar_hu_similares",
        "consultar_estandares", "aplicar_checklist_vacios",
    }),
    AgentId.WRITER_REVIEWER: frozenset({
        "consultar_estandares", "aplicar_checklist_vacios", "buscar_hu_similares",
    }),
    AgentId.TECHNICAL_ADVISOR: frozenset({
        "consultar_estandares", "consultar_codigo_demo", "leer_archivo_codigo", "buscar_hu_similares",
    }),
    AgentId.CHANGE_MANAGER: frozenset({
        "buscar_hu_similares", "consultar_lecciones", "aplicar_checklist_vacios",
    }),
}

AGENT_NAMESPACE_ALLOWLIST: Final[dict[AgentId, frozenset[KnowledgeNamespace]]] = {
    AgentId.ANALYST: frozenset({
        KnowledgeNamespace.GLOSSARY, KnowledgeNamespace.STANDARDS,
        KnowledgeNamespace.CHECKLIST, KnowledgeNamespace.APPROVED_STORIES,
        KnowledgeNamespace.LESSONS,
    }),
    AgentId.WRITER_REVIEWER: frozenset({
        KnowledgeNamespace.STANDARDS, KnowledgeNamespace.CHECKLIST,
        KnowledgeNamespace.APPROVED_STORIES,
    }),
    AgentId.TECHNICAL_ADVISOR: frozenset({
        KnowledgeNamespace.STANDARDS, KnowledgeNamespace.CODE, KnowledgeNamespace.APPROVED_STORIES,
    }),
    AgentId.CHANGE_MANAGER: frozenset({
        KnowledgeNamespace.APPROVED_STORIES, KnowledgeNamespace.LESSONS, KnowledgeNamespace.CHECKLIST,
    }),
}

_TOOL_NAMESPACE: Final[dict[str, KnowledgeNamespace]] = {
    "consultar_glosario": KnowledgeNamespace.GLOSSARY,
    "consultar_estandares": KnowledgeNamespace.STANDARDS,
    "aplicar_checklist_vacios": KnowledgeNamespace.CHECKLIST,
    "buscar_hu_similares": KnowledgeNamespace.APPROVED_STORIES,
    "consultar_lecciones": KnowledgeNamespace.LESSONS,
    "consultar_codigo_demo": KnowledgeNamespace.CODE,
    "leer_archivo_codigo": KnowledgeNamespace.CODE,
}

# Roles que pueden pedir criterio técnico al Asesor durante su propio ciclo.
# El Redactor-Revisor ya lo recibe en el grafo: el Asesor actúa justo después de su borrador.
ASESOR_CONSULTABLE_POR: Final[frozenset[AgentId]] = frozenset({AgentId.ANALYST, AgentId.CHANGE_MANAGER})

# Rondas máximas de consulta por agente (límite de pasos por solicitud).
MAXIMO_RONDA_HERRAMIENTA: Final[dict[AgentId, int]] = {
    AgentId.ANALYST: 1,
    AgentId.WRITER_REVIEWER: 1,
    AgentId.TECHNICAL_ADVISOR: 2,
    AgentId.CHANGE_MANAGER: 1,
}


def tool_namespace(tool_name: str) -> KnowledgeNamespace | None:
    return _TOOL_NAMESPACE.get(tool_name)


def puede_consultar_asesor(agent_id: AgentId | str) -> bool:
    try:
        resolved = agent_id if isinstance(agent_id, AgentId) else AgentId(agent_id)
    except (TypeError, ValueError):
        return False
    return resolved in ASESOR_CONSULTABLE_POR


def get_agent_spec(agent_id: AgentId | str) -> AgentSpec:
    """Resolve a configured role or fail; never substitute the Analyst."""
    try:
        resolved = agent_id if isinstance(agent_id, AgentId) else AgentId(agent_id)
    except (TypeError, ValueError) as exc:
        raise ValueError("Identificador de agente desconocido.") from exc
    return AGENT_SPECS[resolved]


def allowed_mcp_tools(agent_id: AgentId | str) -> frozenset[str]:
    try:
        resolved = agent_id if isinstance(agent_id, AgentId) else AgentId(agent_id)
    except (TypeError, ValueError) as exc:
        raise AgentPermissionError("El rol no está autorizado para invocar herramientas MCP.") from exc
    return MCP_TOOL_ALLOWLIST[resolved]


def authorize_mcp_tool(
    agent_id: AgentId | str,
    tool_name: str,
    namespace: KnowledgeNamespace | str | None = None,
) -> bool:
    """Validate a backend MCP invocation, including role-specific namespace."""
    try:
        resolved = agent_id if isinstance(agent_id, AgentId) else AgentId(agent_id)
        tools = MCP_TOOL_ALLOWLIST[resolved]
        namespaces = AGENT_NAMESPACE_ALLOWLIST[resolved]
    except (TypeError, ValueError) as exc:
        raise AgentPermissionError("El rol no está autorizado para invocar herramientas MCP.") from exc

    if tool_name not in tools:
        raise AgentPermissionError("La herramienta MCP no está permitida para este rol.")
    if namespace is not None:
        try:
            resolved_namespace = (
                namespace if isinstance(namespace, KnowledgeNamespace) else KnowledgeNamespace(namespace)
            )
        except (TypeError, ValueError) as exc:
            raise AgentPermissionError("El namespace solicitado no está permitido.") from exc
        if resolved_namespace not in namespaces:
            raise AgentPermissionError("El namespace solicitado no está permitido para este rol.")
        tool_namespace = _TOOL_NAMESPACE.get(tool_name)
        if tool_namespace is None or resolved_namespace != tool_namespace:
            raise AgentPermissionError("La herramienta no puede acceder al namespace solicitado.")
    return True
