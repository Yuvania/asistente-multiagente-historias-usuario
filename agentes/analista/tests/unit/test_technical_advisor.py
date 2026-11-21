from __future__ import annotations

import json
import subprocess
import sys
from contextlib import asynccontextmanager
from pathlib import Path
from types import SimpleNamespace

import pytest

from agentes.analista.core.agent_registry import AgentId, KnowledgeNamespace
from agentes.analista.core.workflow_models import TechnicalAssessment


def test_demo_policy_application_is_allowlisted_and_read_as_static_text():
    expected = {
        "ejemplos/polizas_demo/__init__.py",
        "ejemplos/polizas_demo/servicios/__init__.py",
        "ejemplos/polizas_demo/modelos.py",
        "ejemplos/polizas_demo/servicios/polizas.py",
        "ejemplos/polizas_demo/servicios/coberturas.py",
        "ejemplos/polizas_demo/servicios/primas.py",
        "ejemplos/polizas_demo/servicios/renovaciones.py",
        "ejemplos/polizas_demo/servicios/pagos.py",
        "ejemplos/polizas_demo/servicios/validaciones.py",
        "ejemplos/polizas_demo/mapa_dependencias.md",
    }
    worker = """
import json, sys
from agentes.analista.mcp.technical_tools import consultar_codigo_demo
before = {name for name in sys.modules if name.startswith('ejemplos.polizas_demo')}
result = consultar_codigo_demo('póliza prima renovación pago cobertura', 12)
after = {name for name in sys.modules if name.startswith('ejemplos.polizas_demo')}
assert not after - before
assert all(source.contenido_no_confiable and source.contenido.strip() for source in result.fuentes)
assert consultar_codigo_demo('código que no existe', 12).fuentes == []
print(json.dumps(sorted(source.source_ref for source in result.fuentes)))
"""
    root = Path(__file__).resolve().parents[4]
    result = subprocess.run(
        [sys.executable, "-c", worker], cwd=root, check=True, capture_output=True, text=True, timeout=30
    )

    assert set(json.loads(result.stdout)) == expected


def test_code_tool_has_no_user_supplied_path_and_advisor_role_is_read_only():
    from pydantic import ValidationError

    from agentes.analista.core.agent_registry import authorize_mcp_tool
    from agentes.analista.mcp.technical_tools import CodeSearchRequest

    with pytest.raises(ValidationError):
        CodeSearchRequest.model_validate({"consulta": "póliza", "ruta": "../../secret.txt"})
    assert authorize_mcp_tool(AgentId.TECHNICAL_ADVISOR, "consultar_codigo_demo", KnowledgeNamespace.CODE)
    with pytest.raises(PermissionError):
        authorize_mcp_tool(AgentId.ANALYST, "consultar_codigo_demo", KnowledgeNamespace.CODE)


@pytest.mark.asyncio
async def test_advisor_cites_only_sources_retrieved_in_this_call(monkeypatch):
    from agentes.analista.core import technical_advisor

    calls = []
    output = {
        "affected_modules": [{
            "source_id": "ejemplos/polizas_demo/servicios/primas.py",
            "source_ref": "ejemplos/polizas_demo/servicios/primas.py",
            "evidence": "El módulo calcula la prima base y aplica factores ficticios.",
        }],
        "dependencies": [{
            "source_id": "estandares:STD-REF-001",
            "source_ref": "agentes/analista/fuentes/estandares.json",
            "evidence": "El estándar consultado requiere validar los datos.",
        }],
        "risks": [],
        "critical_processes": [],
        "uncertainties": [],
    }

    class Tool:
        def __init__(self, name):
            self.name = name

        async def ainvoke(self, arguments):
            calls.append((self.name, arguments))
            if self.name == "consultar_codigo_demo":
                return {"fuentes": [{
                    "source_id": "ejemplos/polizas_demo/servicios/primas.py",
                    "source_ref": "ejemplos/polizas_demo/servicios/primas.py",
                    "contenido": "def calcular_prima(): ...",
                    "contenido_no_confiable": True,
                }], "total": 1, "origen": "simulado"}
            return {"estandares": [{
                "id": "STD-REF-001", "titulo": "Validaciones",
                "regla": "Validar el dato y su mensaje.", "referencia": "Estándar ficticio v1",
            }], "total": 1, "origen": "simulado", "contenido_no_confiable": True}

    class Adapter:
        async def __aenter__(self):
            return self

        async def __aexit__(self, *_args):
            return None

        async def list_tools(self):
            return [Tool("consultar_estandares"), Tool("consultar_codigo_demo")]

    class FakeOpenCode:
        def __init__(self, *, prompt, agent_id):
            assert agent_id == AgentId.TECHNICAL_ADVISOR
            assert "Asesor Técnico" in prompt.text
            self.settings = SimpleNamespace(turn_timeout_seconds=10)

        async def __aenter__(self):
            return self

        async def __aexit__(self, *_args):
            return None

        def set_deadline(self, _deadline):
            pass

        async def server_info(self):
            return {"version": "2.0.27"}

        async def verify_agent(self, agent):
            assert agent == AgentId.TECHNICAL_ADVISOR
            return {"id": agent.value}

        async def select_model(self, _agent):
            return {"providerID": "mock", "id": "mock-model"}

        @asynccontextmanager
        async def session(self, *, title, model):
            assert title.startswith("Asesor Técnico")
            yield {"id": "mock-session"}

        async def submit_prompt(self, _session_id, prompt):
            assert "primas.py" in prompt
            return {"time": {"created": 1}}

        async def wait_for_assistant(self, _session_id, *, deadline, after=None):
            return {"text": json.dumps(output, ensure_ascii=False), "finish": "stop"}

    monkeypatch.setattr(technical_advisor, "MCPAdapter", lambda _server: Adapter())
    monkeypatch.setattr(technical_advisor, "OpenCodeClient", FakeOpenCode)

    assessment = await technical_advisor.TechnicalAdvisor().assess(
        requirement="Ajustar el cálculo de prima de póliza.", story={"quiero": "calcular prima"}
    )

    assert assessment.affected_modules[0].source_ref == "ejemplos/polizas_demo/servicios/primas.py"
    assert assessment.dependencies[0].source_ref == "agentes/analista/fuentes/estandares.json"
    assert [item.source_ref for item in assessment.consulted_sources] == [
        "ejemplos/polizas_demo/servicios/primas.py",
        "agentes/analista/fuentes/estandares.json",
    ]
    assert [name for name, _ in calls] == ["consultar_codigo_demo", "consultar_estandares"]
    assert all(arguments["limite"] in (5, 12) for _, arguments in calls)


@pytest.mark.asyncio
async def test_no_evidence_is_reported_as_uncertainty_without_claims(monkeypatch):
    from agentes.analista.core import technical_advisor

    class Tool:
        def __init__(self, name):
            self.name = name

        async def ainvoke(self, _arguments):
            if self.name == "consultar_codigo_demo":
                return {"fuentes": [], "total": 0, "origen": "simulado"}
            return {"estandares": [], "total": 0, "origen": "simulado", "contenido_no_confiable": True}

    class Adapter:
        async def __aenter__(self):
            return self

        async def __aexit__(self, *_args):
            return None

        async def list_tools(self):
            return [Tool("consultar_codigo_demo"), Tool("consultar_estandares")]

    class FakeOpenCode:
        def __init__(self, *, prompt, agent_id):
            self.settings = SimpleNamespace(turn_timeout_seconds=10)

        async def __aenter__(self):
            return self

        async def __aexit__(self, *_args):
            return None

        def set_deadline(self, _deadline):
            pass

        async def server_info(self):
            return {"version": "2.0.27"}

        async def verify_agent(self, _agent):
            return {"id": "asesor_tecnico"}

        async def select_model(self, _agent):
            return {"id": "mock"}

        @asynccontextmanager
        async def session(self, *, title, model):
            yield {"id": "mock"}

        async def submit_prompt(self, *_args):
            return {"time": {"created": 1}}

        async def wait_for_assistant(self, *_args, **_kwargs):
            return {"text": json.dumps({
                "affected_modules": [], "risks": [], "critical_processes": [],
                "dependencies": [],
                "uncertainties": [],
            }), "finish": "stop"}

    monkeypatch.setattr(technical_advisor, "MCPAdapter", lambda _server: Adapter())
    monkeypatch.setattr(technical_advisor, "OpenCodeClient", FakeOpenCode)

    result = await technical_advisor.TechnicalAdvisor().assess(
        requirement="Consultar un módulo sin coincidencias.", story={}
    )

    assert not result.affected_modules
    assert not result.risks
    assert not result.critical_processes
    assert not result.consulted_sources
    assert result.uncertainties


@pytest.mark.asyncio
async def test_advisor_rejects_model_citations_not_returned_by_mcp(monkeypatch):
    from agentes.analista.core import technical_advisor

    class EmptyProvider:
        async def __call__(self, _query):
            return [], []

    class FakeOpenCode:
        def __init__(self, *, prompt, agent_id):
            self.settings = SimpleNamespace(turn_timeout_seconds=10)

        async def __aenter__(self):
            return self

        async def __aexit__(self, *_args):
            return None

        def set_deadline(self, _deadline):
            pass

        async def server_info(self):
            return {"version": "2.0.27"}

        async def verify_agent(self, _agent):
            return {"id": "asesor_tecnico"}

        async def select_model(self, _agent):
            return {"id": "mock"}

        @asynccontextmanager
        async def session(self, *, title, model):
            yield {"id": "mock"}

        async def submit_prompt(self, *_args):
            return {"time": {"created": 1}}

        async def wait_for_assistant(self, *_args, **_kwargs):
            return {"text": json.dumps({
                "affected_modules": [{
                    "source_id": "inventado.py", "source_ref": "inventado.py", "evidence": "inventado",
                }], "dependencies": [], "risks": [], "critical_processes": [], "uncertainties": [],
            }), "finish": "stop"}

    monkeypatch.setattr(technical_advisor, "OpenCodeClient", FakeOpenCode)
    advisor = technical_advisor.TechnicalAdvisor(source_provider=EmptyProvider())

    with pytest.raises(technical_advisor.TechnicalAdvisorOutputError):
        await advisor.assess(requirement="consulta", story={})


def test_assessment_contract_forbids_scope_decisions():
    from pydantic import ValidationError

    assessment = TechnicalAssessment.model_validate({
        "affected_modules": [], "dependencies": [], "risks": [], "critical_processes": [],
        "consulted_sources": [], "uncertainties": ["Evidencia insuficiente."],
    })
    assert assessment.uncertainties == ["Evidencia insuficiente."]
    with pytest.raises(ValidationError):
        TechnicalAssessment.model_validate({
            "affected_modules": [], "dependencies": [], "risks": [], "critical_processes": [],
            "consulted_sources": [], "uncertainties": [], "approved_scope": True,
        })
    with pytest.raises(ValidationError):
        TechnicalAssessment.model_validate({
            "affected_modules": [{
                "source_id": "outside.py", "source_ref": "outside.py", "evidence": "No consultado.",
            }],
            "dependencies": [], "risks": [], "critical_processes": [],
            "consulted_sources": [], "uncertainties": [],
        })
