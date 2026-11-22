# Historias de Usuario — Agente Analista

Aplicación web para crear historias de usuario (HU) con ayuda de un **Agente Analista de Requerimientos**: analiza el requerimiento, detecta vacíos, genera preguntas para Negocio y, con las respuestas, deja la HU lista para aprobación del Product Owner. Las HU se descargan en Word o PDF con una plantilla de documento configurable.

> Prototipo desarrollado para el curso de IA de Cenfotec. **El diseño del prototipo (interfaz y flujos) se hizo con Antigravity.**

## Qué hace

- **Asistente de 5 pasos:** requerimiento → análisis del agente → preguntas a Negocio → borrador de la HU con criterios (Dado/Cuando/Entonces) → aprobación del Product Owner.
- **Agente Analista:** consulta glosario, HU similares, estándares y checklist de vacíos. No redacta ni aprueba HU. Aprende de las HU aprobadas y de las lecciones que aprueba el Product Owner.
- **Acciones sobre una HU:** ver detalle (solo consulta), editar, solicitar cambio (siempre lleva a un nuevo análisis), descargar (Word/PDF) y eliminar.
- **Ayuda integrada** con el detalle del flujo, el agente, las tecnologías y lo que falta por definir.

## Tecnologías

| Capa | Tecnologías |
|---|---|
| Interfaz | React 18, Vite 5, React Router 6, Sass, lucide-react, react-markdown |
| Documentos | docx (Word), jsPDF + jspdf-autotable (PDF) |
| Backend | Python 3.12, FastAPI, Uvicorn, Pydantic, SQLAlchemy + PyMySQL |
| Agente de IA | LangChain, FastMCP/MCP (herramientas), OpenCode Server 2.1.2 (modelo `glm-5.3-flash`), Langfuse (trazas) |
| Datos | TiDB Cloud (compatible con MySQL) + copia local en el navegador |
| Pruebas | Vitest + Testing Library, pytest |
| Despliegue | Docker, Render |

## Qué está desplegado

La aplicación completa (interfaz + backend + OpenCode) corre como **un solo servicio Docker en Render**, con un solo URL. Cada cambio que llega a `main` se despliega solo (`render.yaml`). Las historias, el Repositorio de HU y las lecciones se guardan en TiDB Cloud, así que no se pierden al redesplegar.

El despliegue vigente desde `main` corresponde al **Agente Analista** y conserva la generación simulada del paso 4. La rama `feat/sistema-multiagente-rag` implementa experimentalmente los workflows, recuperación Pinecone con fallback local y CLI de ingesta; esta implementación no forma parte del servicio desplegado desde `main`. El contrato de Render conserva un Web Service Docker, autenticación existente, TiDB, `/healthz` y un worker. La configuración de Pinecone documentada para la feature usa `PINECONE_API_KEY` desde el entorno; no se ejecutó ingesta real durante esta tarea.

### Feature 003 experimental

La rama `feat/sistema-multiagente-rag` contiene una implementación experimental local de LangGraph y sus endpoints `POST /api/workflows`, `GET /api/workflows/{workflow_id}` y `POST /api/workflows/{workflow_id}/resume`, además de recuperación de conocimiento en el backend y la interfaz React conectada al workflow. Esta rama no cambia `main` ni el servicio de Render. T001 y T002 siguen pendientes de ratificación formal.

El runtime conserva los checkpoints en memoria: al reiniciar FastAPI se pierden y la interfaz pide iniciar un workflow nuevo. La interfaz no guarda `workflow_id` en `localStorage`. Las fuentes de demostración son ficticias; Pinecone y las credenciales se usan solo desde el backend. La configuración del índice, los namespaces y los comandos de ingesta están en la [guía PowerShell](docs/GUIA-PRUEBAS-ARRANQUE-POWERSHELL.md) y el [README del paquete de conocimiento](agentes/conocimiento/README.md). Ningún secreto se envía al navegador.

Para probar esta rama en local, sigue los pasos de instalación anteriores y ejecuta:

```powershell
npm run iniciar
npm test
npm run build
& .\agentes\analista\.venv\Scripts\python.exe -m pytest .\agentes\analista\tests -q
```

En `http://localhost:3000`, crea una HU y completa las respuestas de Negocio para probar `pre_grooming`; desde una HU aprobada abre Solicitar cambio para probar `post_grooming`. La decisión PO o de cambio requiere confirmación explícita en la UI. Si el endpoint de workflow no está disponible, la creación conserva el modo manual existente; la solicitud de cambio ofrece un modo manual con clasificación elegida por la persona. Detén el entorno con `npm run detener`.

- Salud ligera para Render: `<URL de Render>/healthz` (no requiere autenticación).
- Diagnóstico del Analista: `<URL de Render>/api/analista/health` (requiere las credenciales actuales; comprueba OpenCode y MCP).
- Configuración y variables: ver [DESPLIEGUE.md](DESPLIEGUE.md). Los secretos viven solo en el panel de Render, nunca en el repositorio.

## Cómo ejecutarlo en local

**Requisitos:** Node.js 22, Python 3.12 y una cuenta/clave de OpenCode con un modelo autorizado.

1. **Dependencias**
   ```powershell
   npm ci
   py -3.12 -m venv agentes\analista\.venv
   .\agentes\analista\.venv\Scripts\python.exe -m pip install -r agentes\analista\requirements.txt
   ```
2. **Configuración:** copie la plantilla y complete sus valores (no se sube a Git).
   ```powershell
   Copy-Item agentes\analista\.env.example .env
   ```
3. **Iniciar todo** (OpenCode, backend y frontend, cada uno en su ventana):
   ```powershell
   npm run iniciar
   ```
   Abra `http://localhost:3000`. Para detener: `npm run detener`.
4. **Verificar el agente:** `http://127.0.0.1:8000/api/analista/health` debe mostrar `status: ready`.

Solo la interfaz, sin agente (las historias se guardan en el navegador): `npm ci` y `npm run dev`.

**Pruebas**
```powershell
npm test
.\agentes\analista\.venv\Scripts\python.exe -m pytest agentes\analista -q
```

Instrucciones detalladas (OpenCode 2.1.2, arranque manual por terminal, diagnóstico): [docs/GUIA-LOCAL.md](docs/GUIA-LOCAL.md).

Pruebas, arranque y validación del despliegue en PowerShell: [docs/GUIA-PRUEBAS-ARRANQUE-POWERSHELL.md](docs/GUIA-PRUEBAS-ARRANQUE-POWERSHELL.md).

## Equipo

Allam Fernandez · Gilberth Monge · Yuvania Castillo
