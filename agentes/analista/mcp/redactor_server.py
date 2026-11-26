"""Servidor MCP (stdio, solo lectura) del Redactor-Revisor: estándares, checklist y HU similares."""
import sys
from pathlib import Path

PROJECT_ROOT = Path(__file__).resolve().parents[3]
if str(PROJECT_ROOT) not in sys.path:
    sys.path.insert(0, str(PROJECT_ROOT))

from agentes.analista.core.agent_registry import AgentId
from agentes.analista.mcp.tools import crear_servidor

redactor_mcp = crear_servidor(AgentId.WRITER_REVIEWER, "redactor-revisor-fuentes")


def main() -> None:
    redactor_mcp.run(transport="stdio", show_banner=False)


if __name__ == "__main__":
    main()
