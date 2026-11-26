# Asistente multiagente para historias de usuario

Aplicación web que asiste en la creación y el mantenimiento de historias de usuario (HU) mediante un sistema de **cuatro agentes de inteligencia artificial**. Los agentes detectan vacíos en el requerimiento, identifican el impacto del cambio en otras partes del sistema, redactan la historia con sus criterios de aceptación y analizan las solicitudes de cambio posteriores al grooming. Las decisiones finales siempre las toma una persona: la HU solo se aprueba con la confirmación explícita del Product Owner.

Proyecto desarrollado para el curso de Inteligencia Artificial de Cenfotec. El diseño de la interfaz y de los flujos se elaboró con Antigravity.

## Contenido

- [Funcionalidades](#funcionalidades)
- [Flujo de creación de una historia](#flujo-de-creación-de-una-historia)
- [Arquitectura multiagente](#arquitectura-multiagente)
- [Tecnologías](#tecnologías)
- [Ejecución local](#ejecución-local)
- [Pruebas](#pruebas)
- [Despliegue](#despliegue)
- [Seguridad y datos](#seguridad-y-datos)
- [Documentación adicional](#documentación-adicional)
- [Equipo](#equipo)

## Funcionalidades

- **Asistente de seis pasos** para crear una HU, desde el requerimiento de Negocio hasta la aprobación del Product Owner.
- **Análisis de impacto:** antes de redactar la historia, el Asesor Técnico revisa el código del sistema y explica, en lenguaje de negocio, qué otras funciones afecta el cambio y qué reglas falta decidir.
- **Avance persistente:** cada flujo se guarda al esperar una respuesta. Una HU se puede dejar a medias y retomarse otro día desde la sección *En proceso*; un paso que falla se puede reintentar sin perder lo anterior.
- **Gestión de cambios:** las solicitudes de cambio sobre una HU aprobada se clasifican como aclaración o cambio de alcance, con propuesta de lecciones aprendidas.
- **Acciones sobre una HU:** consulta, edición, solicitud de cambio, descarga en Word o PDF con plantilla configurable y eliminación.
- **Ayuda integrada** con el flujo, los agentes, las tecnologías y los temas pendientes de definición.

## Flujo de creación de una historia

| Paso | Responsable | Descripción |
|---|---|---|
| 1. Requerimiento | Analista humano | Registro de la minuta, el correo o el incidente recibido de Negocio |
| 2. Análisis | Agente Analista | Clasificación en información conocida, faltante, supuesta y ambigua |
| 3. Preguntas a Negocio | Negocio | Respuestas a las preguntas del Analista; el ciclo se repite hasta cerrar los vacíos |
| 4. Impacto en otros módulos | Asesor Técnico y analista humano | Funciones afectadas además de la indicada y decisiones pendientes |
| 5. Historia | Agente Redactor-Revisor | Redacción *Como / Quiero / Para* con criterios *Dado que / Cuando / Entonces* y revisión en hasta dos rondas |
| 6. Aprobación | Product Owner | Aprobación, devolución a un agente con motivo o rechazo |

Al aprobarse, la HU se almacena en el Repositorio de HU y se incorpora a la base de conocimiento que consultan los agentes.

## Arquitectura multiagente

La aplicación se ejecuta como un solo servicio: una interfaz en React servida por un backend en FastAPI, que orquesta a los agentes con LangGraph. Cada agente utiliza el modelo de lenguaje a través de OpenCode Server y accede a sus fuentes mediante un servidor MCP propio, respaldado por una base de conocimiento en Pinecone (RAG).

### Ciclo de trabajo de cada agente

Todos los agentes siguen el ciclo **percibir → pensar → actuar** (`agentes/analista/core/ciclo_agente.py`):

1. **Planificación:** el modelo recibe la tarea y las herramientas de su rol, y decide qué consultar y con qué términos.
2. **Ejecución por MCP:** el backend valida el plan contra los permisos del rol y lo ejecuta en el servidor MCP del agente.
3. **Respuesta:** el agente responde con la evidencia recuperada. Si el plan no es válido, el backend consulta todas las fuentes del rol y deja constancia.

### Agentes

| Agente | Autonomía | Razonamiento | Herramientas (servidor MCP propio) | Memoria |
|---|---|---|---|---|
| Analista de Requerimientos | Elige fuentes y consultas; se detiene al entregar preguntas | Clasifica la información en conocida, faltante, supuesta y ambigua | Glosario, HU similares, estándares y checklist de vacíos | Historial de la sesión y Repositorio de HU |
| Asesor Técnico | Decide qué datos buscar y qué archivos abrir, en hasta tres rondas | Identifica todos los lugares que afecta un cambio y separa el impacto de negocio de la evidencia técnica | Referencias en el código, búsqueda semántica, lectura de archivos, estándares y HU similares | Análisis validado y Repositorio de HU |
| Redactor-Revisor | Redacta, revisa y corrige, en hasta dos rondas | Evalúa la HU contra estándares y checklist, y cubre cada impacto con criterios | Estándares, checklist y HU similares | Análisis aclarado, impacto y ronda previa |
| Gestor de Cambios | Elige fuentes y puede consultar al Asesor Técnico | Compara con la HU aprobada, clasifica el cambio y determina la causa raíz | HU aprobadas, lecciones aprendidas y checklist | HU aprobadas e historial de causas raíz |

### Principios de diseño

- **Mínimo privilegio:** cada agente dispone de un servidor MCP (`agentes/analista/mcp/`) que expone únicamente sus herramientas; al conectarse se verifica que el conjunto coincida exactamente. La recuperación también se filtra por rol.
- **Revisión de código en solo lectura:** el Asesor Técnico analiza un repositorio independiente, indicado en `ASESOR_REPOSITORIO_URL` (por defecto, [codigo-ejemplo-polizas](https://github.com/Yuvania/codigo-ejemplo-polizas)). Al arrancar se descarga una copia superficial, se conservan solo archivos `.py` y `.md`, se elimina el historial y no se ejecuta nada. Si no está disponible, se usa la copia incluida en `ejemplos/polizas_demo`.
- **Lenguaje de negocio para las personas usuarias:** la interfaz no muestra archivos, líneas ni código; la evidencia técnica se conserva para Desarrollo.
- **Control humano:** ningún agente aprueba historias. Negocio responde, la persona que redacta la HU toma las decisiones de impacto y el Product Owner aprueba.
- **Trazabilidad:** la sección *Cómo trabajó el agente* muestra qué decidió consultar cada agente y por qué; Langfuse registra cada paso.

### Persistencia de los flujos

Cada vez que un flujo espera a una persona, o falla, su último punto de control se guarda en la tabla `workflow_guardado`. Si el servicio se reinicia, el flujo se recupera al consultarlo y la conversación del Analista se restaura con el último análisis guardado.

| Método | Ruta | Uso |
|---|---|---|
| `POST` | `/api/workflows` | Iniciar un flujo antes o después del grooming |
| `GET` | `/api/workflows` | Listar las HU en proceso |
| `GET` | `/api/workflows/{workflow_id}` | Consultar el estado de un flujo |
| `POST` | `/api/workflows/{workflow_id}/resume` | Responder la decisión que el flujo espera |
| `PUT` | `/api/workflows/{workflow_id}/borrador` | Guardar respuestas sin enviarlas |
| `POST` | `/api/workflows/{workflow_id}/reintentar` | Reintentar el paso que falló |
| `DELETE` | `/api/workflows/{workflow_id}` | Descartar un flujo |

## Tecnologías

| Capa | Tecnologías |
|---|---|
| Interfaz | React 18, Vite 5, React Router 6, Sass, lucide-react, react-markdown |
| Documentos | docx (Word), jsPDF y jspdf-autotable (PDF) |
| Backend | Python 3.12, FastAPI, Uvicorn, Pydantic, SQLAlchemy y PyMySQL |
| Orquestación | LangGraph, con interrupciones para decisiones humanas y puntos de control persistentes |
| Modelo de lenguaje | OpenCode Server 2.1.2 (proveedor OpenCode Go, modelo `glm-5.3-flash`) y LangChain |
| Herramientas | FastMCP y el adaptador MCP de LangChain, con un servidor por agente |
| Conocimiento (RAG) | Pinecone con `multilingual-e5-large` en seis espacios de nombres, carga automática y copia local de respaldo |
| Datos | TiDB Cloud (compatible con MySQL); SQLite en local y en pruebas |
| Observabilidad | Langfuse y registros del servidor |
| Pruebas | Vitest, Testing Library, Playwright, pytest y pytest-asyncio |
| Integración y despliegue | GitHub Actions, Docker y Render |

## Ejecución local

**Requisitos:** Node.js 22, Python 3.12 y una clave de OpenCode con un modelo autorizado.

1. **Instalar las dependencias:**
   ```powershell
   npm ci
   py -3.12 -m venv agentes\analista\.venv
   .\agentes\analista\.venv\Scripts\python.exe -m pip install -r agentes\analista\requirements.txt
   ```
2. **Configurar el entorno** a partir de la plantilla (el archivo `.env` no se versiona):
   ```powershell
   Copy-Item agentes\analista\.env.example .env
   ```
3. **Iniciar OpenCode, el backend y la interfaz:**
   ```powershell
   npm run iniciar
   ```
   La aplicación queda disponible en `http://localhost:3000`. Para detener el entorno: `npm run detener`.
4. **Verificar el estado del servicio:** `http://127.0.0.1:8000/api/analista/health` debe responder `status: ready`.

Para trabajar solo con la interfaz, sin agentes (las historias se guardan en el navegador): `npm ci` y `npm run dev`.

## Pruebas

```powershell
npm test                 # pruebas de la interfaz (Vitest)
npm run test:e2e         # pruebas de navegador (Playwright)
npm run build            # compilación de producción
.\agentes\analista\.venv\Scripts\python.exe -m pytest agentes\analista -q   # pruebas del backend
```

GitHub Actions ejecuta todas las pruebas en cada cambio que llega a `main` y en cada pull request.

## Despliegue

La aplicación completa (interfaz, backend y OpenCode) se publica como un único servicio Docker en Render, con despliegue automático desde la rama `main` (`render.yaml`). Las historias, el Repositorio de HU, las lecciones y los flujos en proceso se almacenan en TiDB Cloud, por lo que se conservan entre despliegues.

- Verificación ligera: `<URL del servicio>/healthz` (sin autenticación).
- Diagnóstico completo: `<URL del servicio>/api/analista/health` (con credenciales; comprueba OpenCode y los cuatro servidores MCP).
- Variables de entorno y configuración: [DESPLIEGUE.md](DESPLIEGUE.md).

## Seguridad y datos

- Los secretos se configuran únicamente en el panel de Render o en el `.env` local; nunca se versionan ni se envían al navegador.
- Las fuentes de conocimiento y el código de ejemplo son ficticios o anonimizados. La interfaz solicita anonimizar los datos personales antes de ingresarlos.
- Los agentes tratan las minutas, el código y los resultados de las herramientas como contenido no confiable y no siguen instrucciones contenidas en ellos.

## Documentación adicional

- [Guía de ejecución local](docs/GUIA-LOCAL.md)
- [Guía de pruebas y arranque en PowerShell](docs/GUIA-PRUEBAS-ARRANQUE-POWERSHELL.md)
- [Evaluación del Asesor Técnico](docs/evaluacion-asesor-tecnico.md)
- [Base de conocimiento e ingesta en Pinecone](agentes/conocimiento/README.md)
- [Despliegue y variables de entorno](DESPLIEGUE.md)

## Equipo

Allam Fernandez · Gilberth Monge · Yuvania Castillo
