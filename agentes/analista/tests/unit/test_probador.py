"""Agente de Pruebas: explora con el navegador (Playwright MCP) solo lo permitido y explica por qué falló un caso."""
from __future__ import annotations

import json
from contextlib import asynccontextmanager
from types import SimpleNamespace

import pytest

from agentes.equipo.probador.probador_service import CasoFallido, ProbadorService
from agentes.pruebas import diagnosticar as modulo_diagnosticar
from agentes.pruebas.navegador_playwright_service import NavegadorNoDisponibleError, NavegadorPlaywrightService

BASE = "http://aplicacion:10000"
DIAGNOSTICO = {
    "que_fallo": "El Product Owner no pudo aprobar la historia.",
    "causa_probable": "La API respondió 403 al confirmar: el rol no tiene la acción «Aprobar historia».",
    "tipo": "error_aplicacion", "confianza": "media",
    "evidencia": ["POST /api/workflows/x/resume respondió 403", "El botón Aprobar está visible"],
    "sugerencia": "Revisar las acciones del rol Product Owner en Mantenimiento.",
}
CASO = {
    "id": "c-web", "titulo": "El PO aprueba la historia", "modulo": "historias", "dispositivo": "web",
    "estado": "fallido", "error": "Esperaba ver «Historia aprobada».", "pasos": ["Ingresa", "Aprueba"],
    "contexto_pagina": "- button \"Aprobar\" [ref=e7]", "registro": [{"tipo": "api", "ruta": "/api/workflows/x/resume", "estado": 403}],
}


class HerramientaFalsa(SimpleNamespace):
    pass


def _herramienta(nombre, propiedad, requerido=()):
    return HerramientaFalsa(name=nombre, input_schema={"properties": propiedad, "required": list(requerido)})


class ClienteMCPFalso:
    """Playwright MCP simulado: registra lo que se le pide y responde texto."""

    def __init__(self, url):
        self.url = url
        self.llamada = []

    async def __aenter__(self):
        return self

    async def __aexit__(self, *_):
        return None

    async def list_tools(self):
        return [
            _herramienta("browser_navigate", {"url": {"type": "string"}}, ["url"]),
            _herramienta("browser_snapshot", {"target": {"type": "string"}, "filename": {"type": "string"}}),
            _herramienta("browser_network_requests", {"static": {"type": "boolean", "default": False}, "filter": {}}, ["static"]),
            _herramienta("browser_evaluate", {"function": {"type": "string"}}, ["function"]),
        ]

    async def call_tool(self, nombre, argumento, raise_on_error=True):
        self.llamada.append((nombre, argumento))
        return SimpleNamespace(content=[SimpleNamespace(text=f"resultado de {nombre}")], is_error=False)


def _modelo(lista_respuesta):
    """OpenCode simulado: responde en orden y guarda los mensajes que recibe."""
    recibido = []

    class OpenCodeFalso:
        def __init__(self, *, prompt, agent_id):
            assert prompt.text and agent_id.value == "probador"
            self.settings = SimpleNamespace(turn_timeout_seconds=120)

        async def __aenter__(self):
            return self

        async def __aexit__(self, *_):
            return None

        def set_deadline(self, _):
            pass

        async def server_info(self):
            return {"version": "2.1.2"}

        async def verify_agent(self, agente):
            return {"id": agente.value}

        async def select_model(self, _):
            return {"providerID": "opencode", "id": "simulado"}

        @asynccontextmanager
        async def session(self, *, title, model):
            yield {"id": "sesion"}

        async def submit_prompt(self, _sesion, texto):
            recibido.append(texto)
            return {"time": {"created": len(recibido)}}

        async def wait_for_assistant(self, _sesion, *, deadline, after=None):
            return {"text": lista_respuesta.pop(0)}

    return OpenCodeFalso, recibido


def _servicio(lista_respuesta, cliente_mcp):
    fabrica, recibido = _modelo(lista_respuesta)
    navegador = lambda: NavegadorPlaywrightService("http://navegador:8931/mcp", BASE, cliente_factory=lambda _url: cliente_mcp)
    return ProbadorService(navegador, BASE, client_factory=fabrica), recibido


@pytest.mark.asyncio
async def test_explora_solo_lo_permitido_y_entrega_el_diagnostico():
    cliente = ClienteMCPFalso("x")
    plan = {"razonamiento": "Ver la pantalla y la red.", "terminado": False, "acciones": [
        {"herramienta": "browser_navigate", "argumentos": {"url": "/pendientes"}},
        {"herramienta": "browser_evaluate", "argumentos": {"function": "() => document.cookie"}},
        {"herramienta": "browser_navigate", "argumentos": {"url": "https://otro-sitio.com"}},
        {"herramienta": "browser_snapshot", "argumentos": {"filename": "/etc/x"}},
    ]}
    segundo = {"razonamiento": "Revisar la API.", "terminado": True,
               "acciones": [{"herramienta": "browser_network_requests", "argumentos": {"filter": "/api/"}}]}
    servicio, recibido = _servicio([json.dumps(plan), json.dumps(segundo), json.dumps(DIAGNOSTICO)], cliente)

    diagnostico, exploracion = await servicio.diagnosticar(CasoFallido.model_validate(CASO))

    assert diagnostico.tipo == "error_aplicacion" and diagnostico.confianza == "media"
    # Solo llegaron al navegador las acciones permitidas, con la ruta completada y sin escribir archivos.
    assert cliente.llamada == [
        ("browser_navigate", {"url": f"{BASE}/pendientes"}), ("browser_snapshot", {}),
        ("browser_network_requests", {"filter": "/api/"}),
    ]
    assert [o.estado for o in exploracion.observacion] == ["ok", "rechazada", "rechazada", "ok", "ok"]
    assert recibido[0].startswith("FASE DE EXPLORACIÓN (ronda 1 de 4)")
    assert "403" in recibido[0] and "Esperaba ver «Historia aprobada»" in recibido[0]
    # Lo que observó en la última ronda va junto con el pedido del diagnóstico.
    assert "resultado de browser_network_requests" in recibido[-1] and "FASE DE DIAGNÓSTICO" in recibido[-1]


@pytest.mark.asyncio
async def test_si_el_diagnostico_no_cumple_el_formato_pide_una_correccion():
    terminar = json.dumps({"razonamiento": "Alcanza con la evidencia.", "acciones": [], "terminado": True})
    servicio, recibido = _servicio([terminar, "No sé, revisá vos.", json.dumps(DIAGNOSTICO)], ClienteMCPFalso("x"))
    diagnostico, _ = await servicio.diagnosticar(CasoFallido.model_validate(CASO))
    assert diagnostico.sugerencia.startswith("Revisar")
    assert "no cumplió el formato" in recibido[-1]


@pytest.mark.asyncio
async def test_sin_navegador_diagnostica_con_la_evidencia_de_la_prueba():
    class SinNavegador:
        async def __aenter__(self):
            raise NavegadorNoDisponibleError("sin conexión")

        async def __aexit__(self, *_):
            return None

    fabrica, recibido = _modelo([json.dumps(DIAGNOSTICO)])
    servicio = ProbadorService(lambda: SinNavegador(), BASE, client_factory=fabrica)
    diagnostico, exploracion = await servicio.diagnosticar(CasoFallido.model_validate(CASO))
    assert diagnostico.que_fallo
    assert "navegador no estuvo disponible" in exploracion.limitacion[0]
    assert recibido == [recibido[0]] and recibido[0].startswith("FASE DE DIAGNÓSTICO")


def test_agrupa_el_mismo_caso_de_varios_dispositivos_y_limita_la_cantidad():
    resumen = {"casos": [
        {**CASO, "id": "c-movil", "dispositivo": "movil"}, {**CASO, "id": "c-web"},
        {**CASO, "id": "otro", "titulo": "Otro caso"}, {**CASO, "id": "ok", "titulo": "Pasa", "estado": "aprobado"},
        {**CASO, "id": "tercero", "titulo": "Tercer caso"},
    ]}
    seleccion, omitidos = modulo_diagnosticar.agrupar_fallidos(resumen, 2)
    assert [(caso.id, lista_id) for caso, lista_id in seleccion] == [("c-web", ["c-movil", "c-web"]), ("otro", ["otro"])]
    assert omitidos == 1


@pytest.mark.asyncio
async def test_un_caso_sin_diagnostico_no_detiene_a_los_demas(monkeypatch):
    class ProbadorFalso:
        def __init__(self, *_args, **_kwargs):
            pass

        async def diagnosticar(self, caso):
            if caso.titulo == "Otro caso":
                raise RuntimeError("tiempo agotado")
            from agentes.equipo.probador.probador_service import Diagnostico, Exploracion
            return Diagnostico.model_validate(DIAGNOSTICO), Exploracion()

    monkeypatch.setattr(modulo_diagnosticar, "ProbadorService", ProbadorFalso)
    salida = await modulo_diagnosticar.diagnosticar({"casos": [CASO, {**CASO, "id": "otro", "titulo": "Otro caso"}]})
    assert salida["diagnosticos"]["c-web"]["estado"] == "listo"
    assert salida["diagnosticos"]["otro"] == {"estado": "sin_diagnostico",
                                              "motivo": "El Agente de Pruebas no pudo diagnosticar (RuntimeError)."}
