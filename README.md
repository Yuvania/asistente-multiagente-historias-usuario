# Historias de Usuario — Sistema multiagente

Aplicación web para crear y mantener historias de usuario (HU) con **cuatro agentes de IA**: el Analista de Requerimientos detecta vacíos y prepara preguntas para Negocio, el Redactor-Revisor redacta y revisa la HU, el Asesor Técnico revisa un repositorio de código para anticipar el impacto, y el Gestor de Cambios clasifica las solicitudes posteriores al grooming. La decisión final siempre la toma una persona (el Product Owner). Las HU se descargan en Word o PDF con una plantilla de documento configurable.

> Prototipo desarrollado para el curso de IA de Cenfotec. **El diseño del prototipo (interfaz y flujos) se hizo con Antigravity.**

## Qué hace

- **Asistente de 5 pasos:** requerimiento → análisis del agente → preguntas a Negocio → borrador de la HU con criterios (Dado/Cuando/Entonces) → aprobación del Product Owner.
- **Cuatro agentes con herramientas por MCP y conocimiento por RAG** (ver [Arquitectura multiagente](#arquitectura-multiagente)). Ninguno aprueba HU: el Product Owner decide.
- **Acciones sobre una HU:** ver detalle (solo consulta), editar, solicitar cambio (siempre lleva a un nuevo análisis), descargar (Word/PDF) y eliminar.
- **Ayuda integrada** con el detalle del flujo, el agente, las tecnologías y lo que falta por definir.

## Tecnologías

| Capa | Tecnologías |
|---|---|
| Interfaz | React 18, Vite 5, React Router 6, Sass, lucide-react, react-markdown |
| Documentos | docx (Word), jsPDF + jspdf-autotable (PDF) |
| Backend | Python 3.12, FastAPI, Uvicorn, Pydantic, SQLAlchemy + PyMySQL |
| Agentes de IA | LangGraph (flujos), LangChain, FastMCP/MCP (un servidor por agente), OpenCode Server 2.1.2 (modelo `glm-5.3-flash`), Langfuse (trazas) |
| Conocimiento (RAG) | Pinecone (`multilingual-e5-large`, seis espacios de nombres) con copia local de respaldo |
| Datos | TiDB Cloud (compatible con MySQL) + copia local en el navegador |
| Pruebas | Vitest + Testing Library, pytest |
| Despliegue | Docker, Render |

## Arquitectura multiagente

Cada agente cumple las cuatro propiedades de un agente y trabaja con el mismo ciclo **Percibir → Pensar → Actuar** (`agentes/analista/core/ciclo_agente.py`):

1. **Planifica:** el modelo recibe la tarea y la lista de herramientas de su rol, y decide qué consultar y con qué texto (plan en JSON).
2. **Actúa por MCP:** el backend valida el plan contra los permisos del rol y lo ejecuta en el servidor MCP del agente. Detrás de cada herramienta está el **RAG** (Pinecone, con copia local si Pinecone no responde).
3. **Responde** con la evidencia recuperada, en la misma sesión. Si el plan no es válido, el backend consulta todas las fuentes del rol y deja constancia.

| Agente | Autonomía | Razonamiento | Herramientas (servidor MCP propio) | Memoria |
|---|---|---|---|---|
| Analista de Requerimientos | Elige fuentes y consultas; puede pedir criterio al Asesor; se detiene al entregar preguntas | Clasifica en conocida, faltante, supuesta y ambigua | Glosario, HU similares, estándares, checklist de vacíos | Historial de la sesión; Repositorio de HU |
| Redactor-Revisor | Redacta, revisa y corrige (máx. dos rondas) | Evalúa la HU contra estándares y checklist | Estándares, checklist, HU similares | Análisis aclarado y ronda previa; Repositorio de HU |
| Asesor Técnico | Decide qué buscar y qué archivos abrir (hasta dos rondas) | Identifica módulos, dependencias y riesgos, en lenguaje de negocio | Búsqueda en el repositorio de código, lectura de archivos, estándares, HU similares | Contexto de la HU; Repositorio de HU |
| Gestor de Cambios | Elige fuentes; puede pedir criterio al Asesor; el PO decide | Compara con la HU aprobada, clasifica y determina la causa raíz | HU aprobadas, lecciones aprendidas, checklist | HU aprobadas e historial de causas raíz |

- **Mínimo privilegio:** cada agente tiene su propio servidor MCP (`agentes/analista/mcp/`) que solo expone sus herramientas; al conectarse se verifica que el servidor exponga exactamente ese conjunto. La recuperación también filtra por rol (por ejemplo, el Gestor solo ve HU y lecciones aprobadas).
- **Asesor Técnico y repositorio de código:** revisa un repositorio aparte, con acceso de solo lectura, indicado en `ASESOR_REPOSITORIO_URL` (por defecto, un repositorio ficticio de pólizas). Al arrancar se descarga con un clon superficial, se conservan solo archivos `.py` y `.md`, se elimina el historial y nada se ejecuta. Si no está configurado o falla, usa el ejemplo incluido en `ejemplos/polizas_demo`.
- **Colaboración:** el Analista y el Gestor pueden consultar al Asesor durante su ciclo; el Redactor-Revisor lo recibe en el flujo, justo después de su borrador.
- **Autonomía visible:** en el paso de análisis, «Cómo trabajó el agente» muestra qué decidió consultar y por qué.

## Qué está desplegado

La aplicación completa (interfaz + backend + OpenCode) corre como **un solo servicio Docker en Render**, con un solo URL. Cada cambio que llega a `main` se despliega solo (`render.yaml`) e incluye el sistema multiagente con los flujos antes y después del grooming. Las historias, el Repositorio de HU y las lecciones se guardan en TiDB Cloud, así que no se pierden al redesplegar.

### Flujos antes y después del grooming

Endpoints: `POST /api/workflows`, `GET /api/workflows/{workflow_id}` y `POST /api/workflows/{workflow_id}/resume` (LangGraph con interrupciones humanas). T001 y T002 siguen pendientes de ratificación formal.

El runtime conserva los checkpoints en memoria: al reiniciar FastAPI se pierden y la interfaz pide iniciar un workflow nuevo. La interfaz no guarda `workflow_id` en `localStorage`. Las fuentes de demostración son ficticias; Pinecone y las credenciales se usan solo desde el backend. La configuración del índice, los namespaces y los comandos de ingesta están en la [guía PowerShell](docs/GUIA-PRUEBAS-ARRANQUE-POWERSHELL.md) y el [README del paquete de conocimiento](agentes/conocimiento/README.md). Ningún secreto se envía al navegador.

Para probarlo en local, sigue los pasos de instalación y ejecuta:

```powershell
npm run iniciar
npm test
npm run build
& .\agentes\analista\.venv\Scripts\python.exe -m pytest .\agentes\analista\tests -q
```

En `http://localhost:3000`, crea una HU y completa las respuestas de Negocio para probar `pre_grooming`; desde una HU aprobada abre Solicitar cambio para probar `post_grooming`. La decisión PO o de cambio requiere confirmación explícita en la UI. Si el endpoint de workflow no está disponible, la creación conserva el modo manual existente; la solicitud de cambio ofrece un modo manual con clasificación elegida por la persona. Detén el entorno con `npm run detener`.

- Salud ligera para Render: `<URL de Render>/healthz` (no requiere autenticación).
- Diagnóstico: `<URL de Render>/api/analista/health` (requiere las credenciales actuales; comprueba OpenCode y que los cuatro servidores MCP expongan solo sus herramientas).
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
