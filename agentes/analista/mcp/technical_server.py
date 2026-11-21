"""Run only the Asesor Técnico's allowlisted, read-only MCP tools over stdio."""
import sys
from pathlib import Path

PROJECT_ROOT = Path(__file__).resolve().parents[3]
if str(PROJECT_ROOT) not in sys.path:
    sys.path.insert(0, str(PROJECT_ROOT))

from agentes.analista.mcp.technical_tools import technical_mcp


def main() -> None:
    technical_mcp.run(transport="stdio", show_banner=False)


if __name__ == "__main__":
    main()
