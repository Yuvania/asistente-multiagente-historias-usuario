"""Barandas de la estructura del proyecto (ver docs/arquitectura.md).

Si una persona o una herramienta de IA agrega un agente y olvida una pieza, estas pruebas fallan con un mensaje
que dice qué falta. No se relajan para que pasen: se completa lo que falta.
"""
import ast
import json
import re
from pathlib import Path

import pytest

from agentes.analista.core.agent_registry import _TOOL_NAMESPACE, AgentId
from agentes.equipo import listar_definicion

RAIZ = Path(__file__).resolve().parents[4]
EQUIPO = RAIZ / "agentes" / "equipo"
DEFINICION = listar_definicion()
PLANTILLA_SERVIDOR = (EQUIPO / "analista" / "servidor_mcp.py").read_text(encoding="utf-8")


def test_cada_carpeta_del_equipo_es_un_agente_registrado():
    carpeta = {ruta.name for ruta in EQUIPO.iterdir() if ruta.is_dir() and not ruta.name.startswith(("_", "."))}
    assert carpeta == {definicion.id for definicion in DEFINICION}
    assert {agente.value for agente in AgentId} == carpeta


@pytest.mark.parametrize("definicion", DEFINICION, ids=lambda definicion: definicion.id)
def test_cada_agente_tiene_prompt_versionado_y_servidor_mcp_estandar(definicion):
    prompt = definicion.ruta_prompt.read_text(encoding="utf-8")
    assert re.search(r"^\*\*Versión editorial:\*\*\s*\d+\.\d+\.\d+", prompt, re.MULTILINE), \
        f"{definicion.id}/prompt.md debe declarar «**Versión editorial:** X.Y.Z»."
    assert definicion.ruta_servidor_mcp.read_text(encoding="utf-8") == PLANTILLA_SERVIDOR, \
        f"{definicion.id}/servidor_mcp.py debe ser igual al de los demás agentes (no se edita)."


@pytest.mark.parametrize("definicion", DEFINICION, ids=lambda definicion: definicion.id)
def test_las_herramientas_del_agente_existen_y_leen_solo_sus_namespaces(definicion):
    desconocida = definicion.herramienta - set(_TOOL_NAMESPACE)
    assert not desconocida, f"{definicion.id} declara herramientas que no existen: {sorted(desconocida)}"
    for herramienta in definicion.herramienta:
        assert _TOOL_NAMESPACE[herramienta].value in definicion.fuente, \
            f"{definicion.id} usa {herramienta} pero no declara el namespace {_TOOL_NAMESPACE[herramienta].value}."


def test_opencode_jsonc_coincide_con_el_registro():
    config = json.loads((RAIZ / "opencode.jsonc").read_text(encoding="utf-8"))
    assert set(config["agents"]) == {definicion.id for definicion in DEFINICION}
    for definicion in DEFINICION:
        agente = config["agents"][definicion.id]
        ruta = definicion.ruta_prompt.relative_to(RAIZ).as_posix()
        assert agente["system"] == f"{{file:./{ruta}}}"
        assert agente["mode"] == definicion.modo_opencode
        assert {"action": "*", "resource": "*", "effect": "deny"} in agente["permissions"]


@pytest.mark.parametrize("definicion", DEFINICION, ids=lambda definicion: definicion.id)
def test_el_servicio_del_agente_sigue_el_estandar_de_nombres(definicion):
    servicio = definicion.carpeta / f"{definicion.id}_service.py"
    assert servicio.is_file(), f"Falta {definicion.id}/{definicion.id}_service.py con la implementación del agente."
    if definicion.id == "analista":
        return  # el Analista es conversacional: su servicio expone run_turn
    clase = [nodo.name for nodo in ast.parse(servicio.read_text(encoding="utf-8")).body if isinstance(nodo, ast.ClassDef)]
    assert any(nombre.endswith("Service") for nombre in clase), \
        f"{servicio.name} debe definir una clase cuyo nombre termine en «Service»."


def test_la_ayuda_describe_a_cada_agente_del_equipo():
    ayuda = (RAIZ / "src" / "data" / "ayudaDocumentacion.js").read_text(encoding="utf-8")
    for definicion in DEFINICION:
        assert f"nombre: '{definicion.nombre}'" in ayuda, \
            f"La Ayuda (src/data/ayudaDocumentacion.js, AGENTES) no describe a «{definicion.nombre}»."


def test_las_skills_para_ia_son_iguales_en_ambas_carpetas():
    """Las guías para herramientas de IA existen en .agents/skills y en .claude/skills, sin diferencias."""
    lista_skill = ("agregar-agente", "agregar-ruta", "estructura-proyecto")
    for skill in lista_skill:
        agentes = RAIZ / ".agents" / "skills" / skill / "SKILL.md"
        claude = RAIZ / ".claude" / "skills" / skill / "SKILL.md"
        assert agentes.is_file() and claude.is_file(), f"Falta la skill «{skill}» en .agents/skills o .claude/skills."
        assert agentes.read_text(encoding="utf-8") == claude.read_text(encoding="utf-8"), \
            f"La skill «{skill}» difiere entre .agents/skills y .claude/skills."


def test_cada_intervencion_humana_del_backend_tiene_formulario_en_la_interfaz():
    from typing import get_args

    from agentes.analista.api.routes.workflows import WorkflowInterrupt

    tipo_backend = set(get_args(WorkflowInterrupt.model_fields["kind"].annotation))
    registro = (RAIZ / "src" / "flujo" / "interrupciones.jsx").read_text(encoding="utf-8")
    tipo_interfaz = set(re.findall(r"^  ([a-z_]+): \{$", registro, re.MULTILINE))
    assert tipo_backend == tipo_interfaz, \
        "Cada tipo de interrupción del backend necesita su entrada en src/flujo/interrupciones.jsx."
