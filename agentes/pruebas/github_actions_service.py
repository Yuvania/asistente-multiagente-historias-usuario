"""Conversación con GitHub Actions: arrancar el workflow de pruebas, seguir su avance y traer el resumen.

Solo necesita un token. El repositorio y la rama salen de Render (``RENDER_GIT_REPO_SLUG`` y
``RENDER_GIT_BRANCH``), así que el mismo servicio funciona desde cualquier repositorio: para cambiar de
repositorio se cambia el token. Fuera de Render se indican con ``GITHUB_PRUEBAS_REPOSITORIO`` y
``GITHUB_PRUEBAS_RAMA``.

Permisos del token (fine-grained, solo ese repositorio): **Actions: lectura y escritura**. Nada más.
El token nunca se registra en los logs ni se envía al navegador.
"""
from __future__ import annotations

import io
import json
import logging
import os
import re
import zipfile
from dataclasses import dataclass
from typing import Any

import httpx

logger = logging.getLogger(__name__)

API_GITHUB = "https://api.github.com"
ARCHIVO_WORKFLOW = "pruebas-e2e.yml"
ARCHIVO_RESUMEN = "resumen.json"
_MAXIMO_RESUMEN = 4 * 1024 * 1024  # bytes del resumen descomprimido
_PATRON_REPOSITORIO = re.compile(r"^[A-Za-z0-9_.-]+/[A-Za-z0-9_.-]+$")
_PATRON_RAMA = re.compile(r"^[A-Za-z0-9_./-]{1,120}$")


class GitHubActionsError(Exception):
    """Error al hablar con GitHub, con un mensaje que se puede mostrar a la persona."""

    def __init__(self, mensaje: str, *, status_code: int = 503) -> None:
        super().__init__(mensaje)
        self.mensaje = mensaje
        self.status_code = status_code


def _entorno(nombre: str) -> str:
    return os.environ.get(nombre, "").strip()


@dataclass(frozen=True)
class ConfiguracionGitHub:
    token: str
    repositorio: str
    rama: str

    @classmethod
    def from_environment(cls) -> "ConfiguracionGitHub":
        repositorio = _entorno("GITHUB_PRUEBAS_REPOSITORIO") or _entorno("RENDER_GIT_REPO_SLUG")
        rama = _entorno("GITHUB_PRUEBAS_RAMA") or _entorno("RENDER_GIT_BRANCH") or "main"
        return cls(
            token=_entorno("GITHUB_PRUEBAS_TOKEN"),
            repositorio=repositorio if _PATRON_REPOSITORIO.match(repositorio) else "",
            rama=rama if _PATRON_RAMA.match(rama) else "main",
        )

    @property
    def configurado(self) -> bool:
        return bool(self.token and self.repositorio)

    def faltante(self) -> list[str]:
        lista_faltante = []
        if not self.token:
            lista_faltante.append("GITHUB_PRUEBAS_TOKEN")
        if not self.repositorio:
            lista_faltante.append("GITHUB_PRUEBAS_REPOSITORIO (fuera de Render)")
        return lista_faltante


class GitHubActionsService:
    def __init__(self, configuracion: ConfiguracionGitHub | None = None, *,
                 transport: httpx.AsyncBaseTransport | None = None, timeout: float = 20.0) -> None:
        self.configuracion = configuracion or ConfiguracionGitHub.from_environment()
        self._transport = transport
        self._timeout = timeout

    # --- Utilidades -----------------------------------------------------
    @property
    def configurado(self) -> bool:
        return self.configuracion.configurado

    @property
    def repositorio(self) -> str:
        return self.configuracion.repositorio

    @property
    def rama(self) -> str:
        return self.configuracion.rama

    def _cliente(self) -> httpx.AsyncClient:
        return httpx.AsyncClient(
            base_url=API_GITHUB, transport=self._transport, timeout=self._timeout, follow_redirects=True,
            headers={
                "Accept": "application/vnd.github+json",
                "Authorization": f"Bearer {self.configuracion.token}",
                "X-GitHub-Api-Version": "2022-11-28",
                "User-Agent": "historias-de-usuario-pruebas",
            },
        )

    def _ruta(self, sufijo: str) -> str:
        return f"/repos/{self.configuracion.repositorio}{sufijo}"

    def _exigir_configuracion(self) -> None:
        if not self.configurado:
            raise GitHubActionsError(
                "Las pruebas automatizadas no están configuradas: falta " + " y ".join(self.configuracion.faltante())
                + " en el servicio.", status_code=503)

    def _revisar(self, respuesta: httpx.Response, operacion: str) -> None:
        if respuesta.status_code < 400:
            return
        logger.warning("github_actions_error", extra={
            "event": "github_actions_error", "operacion": operacion, "status": respuesta.status_code})
        repositorio = self.configuracion.repositorio
        if respuesta.status_code in (401, 403):
            raise GitHubActionsError(
                f"GitHub rechazó el token: revise que no haya vencido y que tenga «Actions: lectura y escritura» "
                f"sobre {repositorio}.", status_code=502)
        if respuesta.status_code == 404:
            raise GitHubActionsError(
                f"GitHub no encontró {ARCHIVO_WORKFLOW} en {repositorio} (rama {self.configuracion.rama}), o el token "
                "no tiene acceso a ese repositorio.", status_code=502)
        if respuesta.status_code == 422:
            raise GitHubActionsError(
                f"GitHub no aceptó la solicitud: revise que {ARCHIVO_WORKFLOW} de la rama {self.configuracion.rama} "
                "sea la versión actual.", status_code=502)
        raise GitHubActionsError("GitHub no respondió como se esperaba. Intente de nuevo en unos minutos.")

    async def _enviar(self, metodo: str, ruta: str, operacion: str, **opciones: Any) -> httpx.Response:
        self._exigir_configuracion()
        try:
            async with self._cliente() as cliente:
                respuesta = await cliente.request(metodo, ruta, **opciones)
        except httpx.HTTPError as exc:
            logger.warning("github_actions_sin_conexion", extra={
                "event": "github_actions_sin_conexion", "operacion": operacion, "error": type(exc).__name__})
            raise GitHubActionsError("No se pudo conectar con GitHub. Intente de nuevo en unos minutos.") from exc
        self._revisar(respuesta, operacion)
        return respuesta

    # --- Operaciones ----------------------------------------------------
    async def disparar(self, entradas: dict[str, str]) -> dict[str, Any]:
        """Arranca el workflow. Devuelve el id de la ejecución si GitHub lo entrega de una vez."""
        respuesta = await self._enviar(
            "POST", self._ruta(f"/actions/workflows/{ARCHIVO_WORKFLOW}/dispatches"), "disparar",
            json={"ref": self.configuracion.rama, "inputs": entradas, "return_run_details": True})
        if respuesta.status_code == 200 and respuesta.content:
            datos = respuesta.json()
            return {"run_id": str(datos.get("workflow_run_id") or "") or None, "run_url": datos.get("html_url")}
        return {"run_id": None, "run_url": None}

    async def buscar_run(self, marca: str) -> dict[str, Any] | None:
        """Ubica la ejecución por su título (``run-name`` lleva el id de la ejecución de la aplicación)."""
        respuesta = await self._enviar(
            "GET", self._ruta(f"/actions/workflows/{ARCHIVO_WORKFLOW}/runs"), "buscar",
            params={"event": "workflow_dispatch", "per_page": 30})
        for run in respuesta.json().get("workflow_runs", []):
            if marca in (run.get("display_title") or run.get("name") or ""):
                return run
        return None

    async def obtener_run(self, run_id: str) -> dict[str, Any]:
        return (await self._enviar("GET", self._ruta(f"/actions/runs/{run_id}"), "obtener")).json()

    async def listar_paso(self, run_id: str) -> list[dict[str, Any]]:
        respuesta = await self._enviar("GET", self._ruta(f"/actions/runs/{run_id}/jobs"), "pasos")
        lista_paso: list[dict[str, Any]] = []
        for trabajo in respuesta.json().get("jobs", []):
            for paso in trabajo.get("steps", []):
                lista_paso.append({
                    "nombre": paso.get("name") or "", "estado": paso.get("status") or "",
                    "conclusion": paso.get("conclusion"), "iniciado_en": paso.get("started_at"),
                    "terminado_en": paso.get("completed_at"),
                })
        return lista_paso

    async def descargar_resumen(self, run_id: str, nombre_artefacto: str) -> dict[str, Any] | None:
        """Descarga el artefacto pequeño con ``resumen.json``. None si la ejecución no lo publicó."""
        respuesta = await self._enviar("GET", self._ruta(f"/actions/runs/{run_id}/artifacts"), "artefactos",
                                       params={"name": nombre_artefacto, "per_page": 10})
        lista_artefacto = [a for a in respuesta.json().get("artifacts", []) if a.get("name") == nombre_artefacto]
        if not lista_artefacto or lista_artefacto[0].get("expired"):
            return None
        archivo = await self._enviar("GET", self._ruta(f"/actions/artifacts/{lista_artefacto[0]['id']}/zip"),
                                     "descargar")
        try:
            with zipfile.ZipFile(io.BytesIO(archivo.content)) as comprimido:
                informacion = comprimido.getinfo(ARCHIVO_RESUMEN)
                if informacion.file_size > _MAXIMO_RESUMEN:
                    raise GitHubActionsError("El resumen de la ejecución es demasiado grande.", status_code=502)
                return json.loads(comprimido.read(ARCHIVO_RESUMEN).decode("utf-8"))
        except (KeyError, zipfile.BadZipFile, ValueError, UnicodeDecodeError) as exc:
            logger.warning("resumen_invalido", extra={"event": "resumen_invalido", "error": type(exc).__name__})
            return None

    async def cancelar(self, run_id: str) -> None:
        await self._enviar("POST", self._ruta(f"/actions/runs/{run_id}/cancel"), "cancelar")
