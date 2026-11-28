"""Qué se puede probar, en qué ambiente y con qué navegador. Es el único registro de las suites.

Cada alcance corresponde a una etiqueta de Playwright (``@historias``, ``@pendientes``...) que llevan las
pruebas de ``e2e/``. El workflow ``.github/workflows/pruebas-e2e.yml`` ofrece las mismas opciones; una prueba de
estructura revisa que las tres listas (este catálogo, las etiquetas de ``e2e/`` y el workflow) coincidan.

Para agregar una suite:
1. Se agrega una línea en ``LISTA_ALCANCE`` con su etiqueta.
2. Las pruebas nuevas en ``e2e/`` llevan esa etiqueta (``test.describe('...', { tag: '@x' }, ...)``).
3. La opción se agrega en ``inputs.alcance.options`` del workflow.
"""
from __future__ import annotations

from dataclasses import dataclass


@dataclass(frozen=True)
class Alcance:
    codigo: str
    nombre: str
    descripcion: str
    etiqueta: str | None  # None: todas las pruebas (regresión)
    permite_produccion: bool = False


@dataclass(frozen=True)
class Opcion:
    codigo: str
    nombre: str
    descripcion: str = ""


LISTA_ALCANCE: tuple[Alcance, ...] = (
    Alcance("regresion", "Todos los módulos (regresión)", "Todas las pruebas de la aplicación.", None),
    Alcance("basicas", "Solo las básicas (smoke)", "Inicio de sesión y que cada pantalla principal abra.",
            "@basicas", permite_produccion=True),
    Alcance("inicio-sesion", "Inicio de sesión", "Entrar, clave incorrecta y salir con confirmación.", "@inicio-sesion"),
    Alcance("historias", "Crear historia (asistente)", "Requerimiento, preguntas a negocio, historia y aprobación.",
            "@historias"),
    Alcance("cambios", "Cambios a historias aprobadas", "Gestor de Cambios y registro manual.", "@cambios"),
    Alcance("pendientes", "Pendientes", "Lo que espera decisión y los avisos por rol.", "@pendientes"),
    Alcance("mantenimiento", "Mantenimiento", "Usuarios, roles y acciones.", "@mantenimiento"),
    Alcance("exportar", "Exportar Word y PDF", "Descarga de la historia aprobada.", "@exportar"),
    Alcance("pruebas", "Pruebas automatizadas", "El propio tablero de ejecuciones.", "@pruebas"),
)

AMBIENTE_PRUEBAS = "pruebas"
AMBIENTE_PRODUCCION = "produccion"
LISTA_AMBIENTE: tuple[Opcion, ...] = (
    Opcion(AMBIENTE_PRUEBAS, "Pruebas",
           "Levanta la aplicación en un contenedor de GitHub con la API simulada: no gasta cuota del modelo ni crea datos."),
    Opcion(AMBIENTE_PRODUCCION, "Producción (solo lectura)",
           "Revisa la aplicación publicada con el usuario de QA, sin crear ni cambiar datos. Solo las básicas."),
)

LISTA_NAVEGADOR: tuple[Opcion, ...] = (
    Opcion("chromium", "Chromium"),
    Opcion("firefox", "Firefox"),
    Opcion("webkit", "WebKit (Safari)"),
)

# Cada prueba corre en estos tres tamaños de pantalla (proyectos de playwright.config.js).
LISTA_DISPOSITIVO: tuple[Opcion, ...] = (Opcion("web", "Web"), Opcion("tablet", "Tablet"), Opcion("movil", "Móvil"))

_ALCANCE = {a.codigo: a for a in LISTA_ALCANCE}
CODIGO_AMBIENTE = frozenset(o.codigo for o in LISTA_AMBIENTE)
CODIGO_NAVEGADOR = frozenset(o.codigo for o in LISTA_NAVEGADOR)


def alcance_de(codigo: str) -> Alcance | None:
    return _ALCANCE.get(codigo)


def nombre_de(lista: tuple[Opcion, ...], codigo: str) -> str:
    return next((o.nombre for o in lista if o.codigo == codigo), codigo)


def como_dict() -> dict[str, list[dict[str, object]]]:
    return {
        "lista_alcance": [
            {"codigo": a.codigo, "nombre": a.nombre, "descripcion": a.descripcion, "etiqueta": a.etiqueta,
             "permite_produccion": a.permite_produccion}
            for a in LISTA_ALCANCE
        ],
        "lista_ambiente": [{"codigo": o.codigo, "nombre": o.nombre, "descripcion": o.descripcion} for o in LISTA_AMBIENTE],
        "lista_navegador": [{"codigo": o.codigo, "nombre": o.nombre} for o in LISTA_NAVEGADOR],
        "lista_dispositivo": [{"codigo": o.codigo, "nombre": o.nombre} for o in LISTA_DISPOSITIVO],
    }
