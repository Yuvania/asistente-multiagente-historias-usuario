"""Keep automated tests isolated from credentials stored in env or the local .env file."""
from __future__ import annotations

import pytest
import os

_EXTERNAL_CREDENTIALS = (
    "OPENCODE_API_KEY",
    "OPENCODE_SERVER_PASSWORD",
    "LANGFUSE_PUBLIC_KEY",
    "LANGFUSE_SECRET_KEY",
    "PINECONE_API_KEY",
    "DATABASE_URL",
    "ANALISTA_REPO_DB",
)


def pytest_sessionstart(session):
    # Empty env vars take precedence over BaseSettings' local .env file.
    for name in _EXTERNAL_CREDENTIALS:
        os.environ[name] = ""


@pytest.fixture(autouse=True)
def _disable_external_service_credentials(monkeypatch):
    for name in _EXTERNAL_CREDENTIALS:
        monkeypatch.setenv(name, "")
