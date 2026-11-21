"""Fragmentación determinista con límite de entrada del embedding Pinecone configurado."""
from __future__ import annotations

from collections.abc import Callable, Iterable
from copy import deepcopy

from langchain_core.documents import Document

from .documents import validate_document_metadata
from .ids import stable_document_id


# Pinecone documenta 507 tokens máximos para multilingual-e5-large.
# Se deja reserva para tokens de inicio/fin del modelo en el límite conservador local.
MAX_EMBEDDING_INPUT_TOKENS = 507
DEFAULT_CHUNK_CHAR_LIMIT = 480
TokenCounter = Callable[[str], int]


def _conservative_token_count(text: str) -> int:
    """Cota local conservadora por puntos de código; puede sustituirse por el tokenizer XLM-R exacto."""
    return len(text)


def _fit_chunk(text: str, start: int, max_end: int, token_counter: TokenCounter, token_limit: int) -> int:
    """Encuentra el prefijo más largo dentro del presupuesto sin cambiar su contenido."""
    low, high = start + 1, max_end
    best = start
    while low <= high:
        middle = (low + high) // 2
        if token_counter(text[start:middle]) <= token_limit:
            best = middle
            low = middle + 1
        else:
            high = middle - 1
    if best == start:
        raise ValueError("Un carácter excede el límite del modelo de embeddings.")
    return best


def chunk_documents(
    documents: Iterable[Document], *, token_counter: TokenCounter = _conservative_token_count,
    token_limit: int = MAX_EMBEDDING_INPUT_TOKENS, char_limit: int = DEFAULT_CHUNK_CHAR_LIMIT,
) -> list[Document]:
    if isinstance(token_limit, bool) or not isinstance(token_limit, int) or not 1 <= token_limit <= MAX_EMBEDDING_INPUT_TOKENS:
        raise ValueError("El límite de tokens debe estar entre 1 y el máximo del modelo.")
    if isinstance(char_limit, bool) or not isinstance(char_limit, int) or char_limit < 1:
        raise ValueError("El límite de caracteres debe ser positivo.")
    output: list[Document] = []
    for document in documents:
        validate_document_metadata(document.metadata)
        text = document.page_content
        if not text.strip():
            continue
        pieces: list[str] = []
        start = 0
        while start < len(text):
            end = min(start + char_limit, len(text))
            if token_counter(text[start:end]) > token_limit:
                end = _fit_chunk(text, start, end, token_counter, token_limit)
            pieces.append(text[start:end])
            start = end
        for index, piece in enumerate(pieces):
            metadata = deepcopy(document.metadata)
            metadata["chunk"] = index
            validate_document_metadata(metadata)
            source_ref = metadata["source_ref"]
            source_id = metadata["source_id"]
            namespace = metadata["namespace"]
            output.append(Document(
                id=stable_document_id(namespace, source_ref, source_id, index),
                page_content=piece,
                metadata=metadata,
            ))
    return output

