"""Dedicated read-only MCP tools for technical fixtures and standards only."""
from __future__ import annotations

import json
import re
import unicodedata
from pathlib import Path
from typing import Annotated, Literal

from fastmcp import FastMCP
from pydantic import BaseModel, ConfigDict, Field, field_validator

from agentes.analista.core.agent_registry import AgentId
from agentes.conocimiento.retrieval import get_knowledge_retriever

PROJECT_ROOT = Path(__file__).resolve().parents[3]
STANDARD_FIXTURE = "agentes/analista/fuentes/estandares.json"
technical_mcp = FastMCP("asesor-tecnico-fuentes")


class ToolModel(BaseModel):
    model_config = ConfigDict(extra="forbid")


class StandardEntry(ToolModel):
    id: str = Field(min_length=1, max_length=80)
    titulo: str = Field(min_length=1, max_length=200)
    regla: str = Field(min_length=1, max_length=1200)
    referencia: str = Field(min_length=1, max_length=200)


class KnowledgeCitation(ToolModel):
    source_id: str = Field(min_length=1, max_length=300)
    source_kind: str = Field(min_length=1, max_length=40)
    source_ref: str = Field(min_length=1, max_length=300)
    namespace: str = Field(min_length=1, max_length=40)
    chunk: int = Field(ge=0)
    score: float
    backend: Literal["pinecone", "local"]


class StandardsResult(ToolModel):
    estandares: list[StandardEntry] = Field(max_length=5)
    total: int = Field(ge=0, le=5)
    origen: Literal["simulado", "anonimizado"]
    contenido_no_confiable: Literal[True]
    status: Literal["ok", "degraded"] = "ok"
    backend: Literal["pinecone", "local", "none"] = "local"
    sources: list[KnowledgeCitation] = Field(default_factory=list, max_length=25)

    @field_validator("total")
    @classmethod
    def total_matches_items(cls, total: int, info):
        items = info.data.get("estandares")
        if items is not None and total != len(items):
            raise ValueError("total debe coincidir con estandares")
        return total


class CodeSearchRequest(BaseModel):
    """Request contract intentionally has no caller-controlled path field."""

    model_config = ConfigDict(extra="forbid", str_strip_whitespace=True)

    consulta: str = Field(min_length=1, max_length=4000)
    limite: int = Field(default=12, ge=1, le=12)


class CodeSource(ToolModel):
    source_id: str = Field(min_length=1, max_length=160)
    source_ref: str = Field(min_length=1, max_length=300)
    contenido: str = Field(min_length=1, max_length=12000)
    contenido_no_confiable: Literal[True]


class CodeSearchResult(ToolModel):
    fuentes: list[CodeSource] = Field(max_length=12)
    total: int = Field(ge=0, le=12)
    origen: Literal["simulado"]
    status: Literal["ok", "degraded"] = "ok"
    backend: Literal["pinecone", "local", "none"] = "local"
    sources: list[KnowledgeCitation] = Field(default_factory=list, max_length=25)

    @field_validator("total")
    @classmethod
    def total_matches_items(cls, total: int, info):
        items = info.data.get("fuentes")
        if items is not None and total != len(items):
            raise ValueError("total debe coincidir con las fuentes")
        return total


_STOPWORDS = frozenset((
    "a al algo ante aun como con contra cual cuando cada de del desde donde e el ella ellos en entre era es esa ese eso "
    "esta este esto estos fue ha han hasta hay la las le les lo los mas me mi muy ni no nos o para pero por que se "
    "segun ser si sin sobre son su sus te tiene tienen todo tras un una uno unos y ya debe deben puede pueden"
).split())


def _tokens(value: str) -> set[str]:
    normalized = unicodedata.normalize("NFKD", value.casefold())
    folded = "".join(char for char in normalized if not unicodedata.combining(char))
    return set(re.findall(r"[^\W_]+", folded, flags=re.UNICODE))


def _content_tokens(value: str) -> set[str]:
    return _tokens(value) - _STOPWORDS


_CODE_DEMO_FILES: tuple[tuple[str, tuple[str, ...]], ...] = (
    ("ejemplos/polizas_demo/__init__.py", ("poliza", "póliza", "version", "demo")),
    ("ejemplos/polizas_demo/servicios/__init__.py", ("poliza", "póliza", "servicio", "demo")),
    ("ejemplos/polizas_demo/modelos.py", ("poliza", "póliza", "cobertura", "prima", "pago", "renovacion", "modelo")),
    ("ejemplos/polizas_demo/servicios/polizas.py", ("poliza", "póliza", "alta", "crear", "activar", "vigencia")),
    ("ejemplos/polizas_demo/servicios/coberturas.py", ("cobertura", "poliza", "póliza", "limite", "deducible")),
    ("ejemplos/polizas_demo/servicios/primas.py", ("prima", "primas", "tarifa", "calculo", "cálculo", "monto")),
    ("ejemplos/polizas_demo/servicios/renovaciones.py", ("renovacion", "renovación", "poliza", "póliza", "prima", "vigencia")),
    ("ejemplos/polizas_demo/servicios/pagos.py", ("pago", "pagos", "importe", "recibo", "poliza", "póliza")),
    ("ejemplos/polizas_demo/servicios/validaciones.py", ("validacion", "validación", "datos", "poliza", "póliza", "prima", "fechas")),
    ("ejemplos/polizas_demo/mapa_dependencias.md", ("modulos", "módulos", "dependencias", "poliza", "póliza", "cobertura", "prima", "pago", "renovacion")),
)


def _load_standards() -> list[dict]:
    """Read only the standards JSON allowlisted for this role."""
    try:
        path = (PROJECT_ROOT / STANDARD_FIXTURE).resolve()
        path.relative_to(PROJECT_ROOT)
        data = json.loads(path.read_text(encoding="utf-8"))
    except (OSError, UnicodeError, ValueError) as exc:
        raise RuntimeError("No se pudo consultar el fixture de estándares técnico.") from exc
    if not isinstance(data, list) or any(not isinstance(item, dict) for item in data):
        raise RuntimeError("El fixture de estándares técnico no cumple el formato esperado.")
    return data


@technical_mcp.tool(name="consultar_estandares", title="Consultar estándares técnicos ficticios")
def consultar_estandares(consulta: str, limite: int = 5) -> StandardsResult:
    """Search the one allowed standards fixture; no other JSON source is opened."""
    if not isinstance(consulta, str) or not consulta.strip() or len(consulta) > 4000:
        raise ValueError("consulta debe contener entre 1 y 4.000 caracteres no vacíos")
    if not isinstance(limite, int) or isinstance(limite, bool) or not 1 <= limite <= 5:
        raise ValueError("limite debe ser un entero entre 1 y 5")
    retrieved = get_knowledge_retriever().search(
        agent_role=AgentId.TECHNICAL_ADVISOR, query=consulta, namespace="estandares", limit=limite,
    )
    items = []
    for source in retrieved.sources:
        try:
            item = json.loads(source.text)
        except (TypeError, json.JSONDecodeError):
            continue
        if isinstance(item, dict):
            items.append(item)
    found = [StandardEntry.model_validate({key: item[key] for key in StandardEntry.model_fields}) for item in items]
    return StandardsResult(
        estandares=found, total=len(found), origen="simulado", contenido_no_confiable=True,
        status=retrieved.status, backend=retrieved.backend,
        sources=[{
            "source_id": source.source_id, "source_kind": source.source_kind,
            "source_ref": source.source_ref, "namespace": source.namespace,
            "chunk": source.chunk, "score": source.score, "backend": source.backend,
        } for source in retrieved.sources],
    )


@technical_mcp.tool(name="consultar_codigo_demo", title="Buscar código ficticio allowlisted")
def consultar_codigo_demo(consulta: str, limite: int = 12) -> CodeSearchResult:
    """Read matching allowlisted demo files as untrusted data; never import or execute."""
    request = CodeSearchRequest(consulta=consulta, limite=limite)
    retrieved = get_knowledge_retriever().search(
        agent_role=AgentId.TECHNICAL_ADVISOR, query=request.consulta, namespace="codigo", limit=request.limite,
    )
    sources: list[CodeSource] = []
    for source in retrieved.sources:
        if len(source.text) <= 12000:
            sources.append(CodeSource(
                source_id=source.source_id,
                source_ref=source.source_ref,
                contenido=source.text,
                contenido_no_confiable=True,
            ))
    return CodeSearchResult(
        fuentes=sources, total=len(sources), origen="simulado",
        status=retrieved.status, backend=retrieved.backend,
        sources=[{
            "source_id": source.source_id, "source_kind": source.source_kind,
            "source_ref": source.source_ref, "namespace": source.namespace,
            "chunk": source.chunk, "score": source.score, "backend": source.backend,
        } for source in retrieved.sources],
    )
