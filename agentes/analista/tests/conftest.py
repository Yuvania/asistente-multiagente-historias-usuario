"""Keep automated tests isolated from external Pinecone and TiDB credentials."""
from __future__ import annotations

import pytest
import os


def pytest_sessionstart(session):
    # Runs before test modules import the MCP fixtures.
    os.environ.pop("PINECONE_API_KEY", None)
    os.environ.pop("DATABASE_URL", None)
    os.environ.pop("ANALISTA_REPO_DB", None)


@pytest.fixture(autouse=True)
def _disable_external_service_credentials(monkeypatch):
    monkeypatch.delenv("PINECONE_API_KEY", raising=False)
    monkeypatch.delenv("DATABASE_URL", raising=False)
    monkeypatch.delenv("ANALISTA_REPO_DB", raising=False)
