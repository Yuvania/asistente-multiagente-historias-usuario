"""Integración segura con el índice vectorial Pinecone del backend."""

from .client import PineconeKnowledgeClient
from .config import PineconeSettings
from .contract import DEFAULT_INDEX_CONTRACT, PineconeIndexContract
from .errors import (
    PineconeAuthenticationError,
    PineconeConfigurationError,
    PineconeCredentialsMissingError,
    PineconeIndexIncompatibleError,
    PineconeIndexNotFoundError,
    PineconeServiceError,
    PineconeTimeoutError,
)

__all__ = [
    "DEFAULT_INDEX_CONTRACT",
    "PineconeAuthenticationError",
    "PineconeConfigurationError",
    "PineconeCredentialsMissingError",
    "PineconeIndexContract",
    "PineconeIndexIncompatibleError",
    "PineconeIndexNotFoundError",
    "PineconeKnowledgeClient",
    "PineconeServiceError",
    "PineconeSettings",
    "PineconeTimeoutError",
]
