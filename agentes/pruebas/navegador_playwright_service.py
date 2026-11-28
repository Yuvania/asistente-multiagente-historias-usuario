"""Navegador del Agente de Pruebas: cliente de Playwright MCP con mínimo privilegio.

Playwright MCP (el servidor oficial de Microsoft) le da al agente un navegador real. Expone más de 20
herramientas, algunas peligrosas (ejecutar JavaScript, subir archivos). El backend se queda solo con las de
navegar, leer y operar la página, y revisa cada llamada antes de hacerla:

- Solo las herramientas de ``HERRAMIENTA_PERMITIDA``; el resto se rechaza y queda registrado.
- Solo los parámetros que declara la herramienta (sin ``filename``: no escribe archivos).
- ``browser_navigate`` solo abre la aplicación de prueba (``BASE_URL``); una ruta como ``/pendientes`` se
  completa con esa dirección. Cualquier otro origen se rechaza.
- Cada llamada tiene tiempo límite y su resultado se recorta y se trata como dato no confiable.
"""
from __future__ import annotations

import asyncio
import logging
from dataclasses import dataclass, field
from typing import Any
from urllib.parse import urljoin, urlsplit

logger = logging.getLogger(__name__)

TIEMPO_HERRAMIENTA_SEGUNDO = 20.0
MAXIMO_TEXTO = 4000
MAXIMO_TEXTO_PAGINA = 7000

HERRAMIENTA_PERMITIDA: dict[str, str] = {
    "browser_navigate": "Abre una pantalla de la aplicación. url: ruta (por ejemplo /pendientes) o dirección completa.",
    "browser_navigate_back": "Vuelve a la pantalla anterior.",
    "browser_snapshot": "Lee la página: árbol de accesibilidad con roles, textos y referencias (ref=e12).",
    "browser_click": "Hace clic en un elemento. target: la referencia del árbol (e12); element: qué es, en palabras.",
    "browser_type": "Escribe en un campo. target: referencia; text: el texto; submit: true para enviar.",
    "browser_select_option": "Elige una opción de una lista. target: referencia; values: lista de valores.",
    "browser_press_key": "Presiona una tecla (Enter, Escape, Tab...).",
    "browser_wait_for": "Espera un texto, que desaparezca un texto o unos segundos (máximo 10).",
    "browser_console_messages": "Mensajes de la consola. level: error, warning o info.",
    "browser_network_requests": "Llamadas que hizo la página (método, dirección y estado). filter: expresión, por ejemplo /api/.",
}
HERRAMIENTA_NECESARIA = frozenset({"browser_navigate", "browser_snapshot"})
_PARAMETRO_PROHIBIDO = frozenset({"filename"})


class NavegadorNoDisponibleError(RuntimeError):
    """Playwright MCP no responde o no expone las herramientas mínimas."""


@dataclass(frozen=True, slots=True)
class HerramientaNavegador:
    nombre: str
    descripcion: str
    parametro: dict[str, str]
    requerido: frozenset[str]

    def como_texto(self) -> str:
        lista = ", ".join(
            f"{nombre}{'*' if nombre in self.requerido else ''}" for nombre in sorted(self.parametro)
        ) or "sin parámetros"
        return f"- {self.nombre} ({lista}): {self.descripcion}"


@dataclass(slots=True)
class ObservacionNavegador:
    herramienta: str
    argumento: dict[str, Any]
    estado: str  # ok | error | rechazada | tiempo
    texto: str = ""

    def como_dato(self) -> dict[str, Any]:
        return {"herramienta": self.herramienta, "argumentos": self.argumento, "estado": self.estado, "resultado": self.texto}


@dataclass(slots=True)
class _Estado:
    cliente: Any = None
    catalogo: dict[str, HerramientaNavegador] = field(default_factory=dict)


def _texto_resultado(resultado: Any) -> str:
    lista_texto = [getattr(item, "text", "") for item in getattr(resultado, "content", None) or []]
    return "\n".join(texto for texto in lista_texto if texto).strip()


def _recortar(texto: str, maximo: int) -> str:
    return texto if len(texto) <= maximo else texto[:maximo] + "\n[… recortado]"


class NavegadorPlaywrightService:
    """``async with NavegadorPlaywrightService(url_mcp, base_url) as navegador: await navegador.ejecutar(...)``."""

    def __init__(self, url_mcp: str, base_url: str, *, cliente_factory: Any | None = None) -> None:
        if not url_mcp.startswith(("http://", "https://")):
            raise NavegadorNoDisponibleError("La dirección de Playwright MCP no es válida.")
        self.url_mcp = url_mcp
        self.base_url = base_url.rstrip("/") + "/"
        self._origen = urlsplit(self.base_url)
        self._cliente_factory = cliente_factory
        self._estado = _Estado()

    async def __aenter__(self) -> "NavegadorPlaywrightService":
        if self._cliente_factory is None:
            from fastmcp import Client

            self._cliente_factory = Client
        try:
            self._estado.cliente = self._cliente_factory(self.url_mcp)
            await self._estado.cliente.__aenter__()
            lista_herramienta = await self._estado.cliente.list_tools()
        except Exception as exc:
            logger.warning("navegador_no_disponible", extra={"event": "navegador_no_disponible", "error": type(exc).__name__})
            await self._cerrar()
            raise NavegadorNoDisponibleError("No se pudo conectar con Playwright MCP.") from exc
        for herramienta in lista_herramienta:
            if herramienta.name not in HERRAMIENTA_PERMITIDA:
                continue
            esquema = getattr(herramienta, "input_schema", None) or getattr(herramienta, "inputSchema", None) or {}
            propiedad = esquema.get("properties") or {}
            parametro = {
                nombre: str((detalle or {}).get("description") or "")[:160]
                for nombre, detalle in propiedad.items() if nombre not in _PARAMETRO_PROHIBIDO
            }
            self._estado.catalogo[herramienta.name] = HerramientaNavegador(
                nombre=herramienta.name, descripcion=HERRAMIENTA_PERMITIDA[herramienta.name], parametro=parametro,
                # Un parámetro con valor por defecto no se exige aunque el esquema lo marque obligatorio.
                requerido=frozenset(esquema.get("required") or []) - _PARAMETRO_PROHIBIDO
                - {nombre for nombre, detalle in propiedad.items() if "default" in (detalle or {})},
            )
        faltante = HERRAMIENTA_NECESARIA - set(self._estado.catalogo)
        if faltante:
            await self._cerrar()
            raise NavegadorNoDisponibleError(f"Playwright MCP no expone {', '.join(sorted(faltante))}.")
        return self

    async def __aexit__(self, *_: Any) -> None:
        await self._cerrar()

    async def _cerrar(self) -> None:
        cliente, self._estado.cliente = self._estado.cliente, None
        if cliente is None:
            return
        try:
            await cliente.__aexit__(None, None, None)
        except Exception as exc:
            logger.warning("navegador_cierre_fallido", extra={"event": "navegador_cierre_fallido", "error": type(exc).__name__})

    def catalogo(self) -> list[HerramientaNavegador]:
        return list(self._estado.catalogo.values())

    def _url_permitida(self, valor: Any) -> str | None:
        if not isinstance(valor, str) or not valor.strip():
            return None
        destino = urljoin(self.base_url, valor.strip())
        partes = urlsplit(destino)
        if (partes.scheme, partes.netloc) != (self._origen.scheme, self._origen.netloc):
            return None
        return destino

    def validar(self, nombre: str, argumento: Any) -> tuple[dict[str, Any] | None, str | None]:
        """Devuelve los argumentos limpios o el motivo del rechazo."""
        herramienta = self._estado.catalogo.get(nombre)
        if herramienta is None:
            return None, "herramienta no permitida"
        if not isinstance(argumento, dict):
            argumento = {}
        limpio = {clave: valor for clave, valor in argumento.items() if clave in herramienta.parametro}
        if nombre == "browser_navigate":
            url = self._url_permitida(limpio.get("url"))
            if url is None:
                return None, "solo se puede abrir la aplicación de prueba"
            limpio["url"] = url
        if nombre == "browser_wait_for" and isinstance(limpio.get("time"), (int, float)):
            limpio["time"] = min(float(limpio["time"]), 10.0)
        faltante = herramienta.requerido - set(limpio)
        if faltante:
            return None, f"faltan parámetros: {', '.join(sorted(faltante))}"
        return limpio, None

    async def ejecutar(self, nombre: str, argumento: Any) -> ObservacionNavegador:
        limpio, motivo = self.validar(nombre, argumento)
        if limpio is None:
            logger.info("navegador_accion_rechazada", extra={"event": "navegador_accion_rechazada", "herramienta": nombre[:60]})
            return ObservacionNavegador(nombre[:60], {}, "rechazada", motivo or "")
        if self._estado.cliente is None:
            return ObservacionNavegador(nombre, limpio, "error", "El navegador no está abierto.")
        try:
            resultado = await asyncio.wait_for(
                self._estado.cliente.call_tool(nombre, limpio, raise_on_error=False), TIEMPO_HERRAMIENTA_SEGUNDO,
            )
        except TimeoutError:
            return ObservacionNavegador(nombre, limpio, "tiempo", f"No respondió en {TIEMPO_HERRAMIENTA_SEGUNDO:.0f} s.")
        except Exception as exc:
            logger.warning("navegador_accion_fallida", extra={"event": "navegador_accion_fallida", "herramienta": nombre, "error": type(exc).__name__})
            return ObservacionNavegador(nombre, limpio, "error", "La herramienta falló.")
        maximo = MAXIMO_TEXTO_PAGINA if nombre == "browser_snapshot" else MAXIMO_TEXTO
        estado = "error" if getattr(resultado, "is_error", False) else "ok"
        return ObservacionNavegador(nombre, limpio, estado, _recortar(_texto_resultado(resultado), maximo))
