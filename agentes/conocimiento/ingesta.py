"""CLI explícita y allowlisted para preparar e ingerir conocimiento RAG."""
from __future__ import annotations

import argparse
import json
import re
import sys
from collections.abc import Callable, Iterable, Mapping
from typing import Any

from langchain_core.documents import Document

from .batches import PreparedBatch, obsolete_ids, prepare_batches
from .client import PineconeKnowledgeClient
from .sources import AuthorizedSourceLoader, SourceError, SourceRecord, validate_namespace


SOURCE_CHOICES = ("todas", "glosario", "estandares", "checklist", "hu_similares", "repositorio", "codigo")
JSON_SOURCE_CHOICES = ("glosario", "estandares", "checklist", "hu_similares")
NAMESPACES = ("glosario", "estandares", "checklist", "hu_aprobadas", "lecciones", "codigo")
_SOURCE_MAP = {"glosario": "glosario", "estandares": "estandares", "checklist": "checklist", "hu_similares": "hu_similares"}
_RECONCILE_TOP_K = 10_000


def build_parser() -> argparse.ArgumentParser:
    parser = argparse.ArgumentParser(description="Ingesta explícita de las fuentes RAG permitidas.")
    parser.add_argument("--fuente", choices=SOURCE_CHOICES, required=True)
    parser.add_argument("--dry-run", action="store_true", help="Valida y prepara documentos sin llamadas remotas.")
    parser.add_argument("--crear-indice", action="store_true", help="Crea el índice solo si no existe; si existe lo valida.")
    return parser


def _safe_code(error: BaseException, fallback: str) -> str:
    code = getattr(error, "code", None)
    return code if isinstance(code, str) and re.fullmatch(r"[A-Z0-9_]{1,64}", code) else fallback


def _load_sources(
    loader: AuthorizedSourceLoader,
    source: str,
    *,
    repository_factory: Callable[[], Any] | None,
) -> tuple[list[tuple[str, list[SourceRecord]]], list[dict[str, str]]]:
    selected = list(JSON_SOURCE_CHOICES) + ["repositorio", "codigo"] if source == "todas" else [source]
    loaded: list[tuple[str, list[SourceRecord]]] = []
    errors: list[dict[str, str]] = []
    for name in selected:
        try:
            if name in _SOURCE_MAP:
                records = loader.load_json_source(_SOURCE_MAP[name])
            elif name == "repositorio":
                if repository_factory is None:
                    from agentes.analista.memory.repositorio import RepositorioHU

                    repository_factory = lambda: RepositorioHU(crear_esquema=False)
                records = loader.load_approved_repository(repository_factory())
            elif name == "codigo":
                records = loader.load_demo_code()
            else:
                raise SourceError("Fuente no autorizada.")
            loaded.append((name, records))
        except SourceError as exc:
            errors.append({"source": name, "code": _safe_code(exc, "SOURCE_INVALID")})
        except Exception as exc:
            errors.append({"source": name, "code": _safe_code(exc, "SOURCE_UNAVAILABLE")})
    return loaded, errors


def _prepare(
    loaded: Iterable[tuple[str, list[SourceRecord]]],
) -> tuple[list[PreparedBatch], dict[str, dict[str, int]], list[dict[str, str]]]:
    counts = {namespace: {"read": 0, "validated": 0, "upserted": 0, "excluded": 0} for namespace in NAMESPACES}
    batches: list[PreparedBatch] = []
    errors: list[dict[str, str]] = []
    for source_name, records in loaded:
        for record in records:
            counts[validate_namespace(record.namespace)]["read"] += 1
        try:
            prepared = prepare_batches(records)
        except Exception as exc:
            errors.append({"source": source_name, "code": _safe_code(exc, "DOCUMENT_PREPARATION_FAILED")})
            for record in records:
                counts[record.namespace]["excluded"] += 1
            continue
        batches.extend(prepared)
        for batch in prepared:
            counts[batch.namespace]["validated"] += len(batch.documents)
    return batches, counts, errors


def _matches(response: Any) -> list[Any]:
    if isinstance(response, Mapping):
        result = response.get("matches", [])
    else:
        result = getattr(response, "matches", [])
    return list(result or [])


def _match_id(match: Any) -> str | None:
    value = match.get("id") if isinstance(match, Mapping) else getattr(match, "id", None)
    return value if isinstance(value, str) and value else None


def _match_metadata(match: Any) -> Mapping[str, Any]:
    value = match.get("metadata", {}) if isinstance(match, Mapping) else getattr(match, "metadata", {})
    return value if isinstance(value, Mapping) else {}


def _reconcile_source(index: Any, batch: PreparedBatch) -> int:
    """Read and delete only exact source_id/source_ref matches in the batch namespace."""
    response = index.query(
        vector=[1.0] + [0.0] * 1023,
        namespace=batch.namespace,
        top_k=_RECONCILE_TOP_K,
        filter={
            "source_id": {"$eq": batch.source_id},
            "source_ref": {"$eq": batch.source_ref},
        },
        include_metadata=True,
    )
    matches = _matches(response)
    if len(matches) >= _RECONCILE_TOP_K:
        raise RuntimeError("RECONCILIATION_RESULT_LIMIT")
    existing = [
        Document(page_content="", id=document_id, metadata=dict(_match_metadata(match)))
        for match in matches
        if (document_id := _match_id(match)) is not None
    ]
    stale_ids = obsolete_ids(existing, batch)
    if stale_ids:
        index.delete(ids=sorted(stale_ids), namespace=batch.namespace)
    return len(stale_ids)


def _upsert_batches(
    batches: Iterable[PreparedBatch],
    *,
    client: PineconeKnowledgeClient,
    counts: dict[str, dict[str, int]],
) -> list[dict[str, str]]:
    errors: list[dict[str, str]] = []
    stores: dict[str, Any] = {}
    indexes: dict[str, Any] = {}
    for batch in batches:
        source_name = batch.source_ref.split("/")[-1].split("#")[0]
        try:
            if batch.namespace not in stores:
                store = client.create_vector_store(namespace=batch.namespace)
                index = client.get_vector_index()
                stores[batch.namespace] = store
                indexes[batch.namespace] = index
            store = stores[batch.namespace]
            index = indexes[batch.namespace]
            store.add_documents(list(batch.documents), ids=[document.id for document in batch.documents])
            counts[batch.namespace]["upserted"] += len(batch.documents)
        except Exception as exc:
            errors.append({"source": source_name, "namespace": batch.namespace, "code": _safe_code(exc, "UPSERT_FAILED")})
            continue
        try:
            _reconcile_source(index, batch)
        except Exception as exc:
            errors.append({
                "source": source_name, "namespace": batch.namespace,
                "code": _safe_code(exc, "RECONCILIATION_FAILED"),
            })
    return errors


def run_ingestion(
    *,
    fuente: str,
    dry_run: bool = False,
    crear_indice: bool = False,
    loader: AuthorizedSourceLoader | None = None,
    client_factory: Callable[[], PineconeKnowledgeClient] | None = None,
    repository_factory: Callable[[], Any] | None = None,
) -> dict[str, Any]:
    if fuente not in SOURCE_CHOICES:
        raise ValueError("Fuente no autorizada.")
    authorized_loader = loader or AuthorizedSourceLoader()
    loaded, errors = _load_sources(authorized_loader, fuente, repository_factory=repository_factory)
    batches, counts, preparation_errors = _prepare(loaded)
    errors.extend(preparation_errors)
    if dry_run:
        return {
            "status": "dry_run" if not errors else "partial_failure",
            "dry_run": True,
            "index": "not_contacted",
            "namespaces": counts,
            "errors": errors,
            "batches": len(batches),
        }

    client = (client_factory or PineconeKnowledgeClient)()
    try:
        if crear_indice:
            client.create_index_if_missing()
        else:
            client.validate_index()
    except Exception as exc:
        errors.append({"source": "pinecone_index", "code": _safe_code(exc, "INDEX_VALIDATION_FAILED")})
        return {
            "status": "failed", "dry_run": False,
            "index": "not_ready", "namespaces": counts, "errors": errors,
        }
    errors.extend(_upsert_batches(batches, client=client, counts=counts))
    return {
        "status": "success" if not errors else "partial_failure",
        "dry_run": False,
        "index": "created_or_validated",
        "namespaces": counts,
        "errors": errors,
        "batches": len(batches),
    }


def main(
    argv: list[str] | None = None,
    *,
    client_factory: Callable[[], PineconeKnowledgeClient] | None = None,
    loader: AuthorizedSourceLoader | None = None,
    repository_factory: Callable[[], Any] | None = None,
    stdout: Any = None,
) -> int:
    args = build_parser().parse_args(argv)
    result = run_ingestion(
        fuente=args.fuente, dry_run=args.dry_run, crear_indice=args.crear_indice,
        loader=loader, client_factory=client_factory, repository_factory=repository_factory,
    )
    stream = stdout or sys.stdout
    stream.write(json.dumps(result, ensure_ascii=False, sort_keys=True) + "\n")
    return 0 if result["status"] in {"success", "dry_run"} else 1


if __name__ == "__main__":
    raise SystemExit(main())
