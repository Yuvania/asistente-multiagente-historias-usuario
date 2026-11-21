# Guía de pruebas y arranque en PowerShell

Esta guía distingue el servicio desplegado desde `main` de la implementación experimental en `feat/sistema-multiagente-rag`. No modifica `main`, no hace merge ni despliega a Render. T001/T002 siguen pendientes de ratificación formal.

## Requisitos

- Node.js 22 o superior y npm.
- Python 3.12 para FastAPI y pruebas.
- OpenCode Server local en `127.0.0.1:4096` para pruebas manuales con modelos.
- `.env` local configurado desde `agentes\analista\.env.example`. No imprimas ni copies credenciales en logs o documentación.

## Instalar y arrancar la UI

Desde la raíz del repositorio:

```powershell
npm ci
py -3.12 -m venv .\agentes\analista\.venv
& .\agentes\analista\.venv\Scripts\python.exe -m pip install -r .\agentes\analista\requirements.lock
if (-not (Test-Path .\.env)) { Copy-Item .\agentes\analista\.env.example .\.env }
```

Completa `.env` localmente según `.env.example`. No copies secretos al navegador; la UI usa same-origin y conserva la autenticación Basic existente.

Inicia OpenCode, FastAPI y Vite con el script existente:

```powershell
npm run iniciar
```

Abre `http://localhost:3000`. Vite pasa `/api/analista` y `/api/workflows` a FastAPI en `127.0.0.1:8000`. El backend debe correr con un solo worker porque conversaciones y checkpoints viven en memoria. Para detenerlo:

```powershell
npm run detener
```

También puedes abrir cada servicio por separado siguiendo `agentes\analista\README.md`.

## Probar los workflows desde la UI

1. En `http://localhost:3000/historias/nueva`, completa el requerimiento y pulsa **Analizar Requerimiento**. La UI crea un workflow `pre_grooming`.
2. Revisa análisis, preguntas, HU del Redactor-Revisor, observaciones, evaluación técnica y decisión del PO. Responde todas las preguntas pendientes antes de avanzar.
3. La aprobación PO exige confirmación explícita. El backend guarda la HU al completar esa decisión; la UI no llama `repositorioApi.saveStory` en este flujo.
4. Desde una HU aprobada, abre **Solicitar cambio** para probar `post_grooming`. La UI carga la HU aprobada del Repositorio real; el Gestor puede recomendar `aclaracion` o `cambio_alcance`. Aceptar, rechazar y devolver requieren confirmación.
5. Las lecciones quedan como propuestas salvo que la persona elija expresamente aprobarlas o rechazarlas.

Si el endpoint de workflows no responde al crear la HU, la pantalla conserva el flujo manual del Analista. Solicitud de cambio permite optar por un modo manual y elegir clasificación. La UI nunca mezcla un guardado manual con una aprobación workflow.

Los IDs de workflow no se guardan en `localStorage`. El checkpoint está en memoria del backend y se pierde al reiniciar el proceso; si un `GET` o `resume` devuelve 404, la UI lo informa y pide iniciar un workflow nuevo. No afirma que recuperó el checkpoint anterior.

## Salud del backend

```powershell
Invoke-RestMethod -Uri 'http://127.0.0.1:8000/healthz'
$credencial = Get-Credential
Invoke-RestMethod -Uri 'http://127.0.0.1:8000/api/analista/health' -Credential $credencial | ConvertTo-Json -Depth 8
```

`/api/analista/health` comprueba el Analista, OpenCode y MCP. No demuestra la identidad individual del PO: la autenticación Basic compartida no distingue qué persona tomó la decisión.

Las rutas HTTP de workflow son `POST /api/workflows`, `GET /api/workflows/{workflow_id}` y `POST /api/workflows/{workflow_id}/resume`. El cuerpo de reanudación usa el `interrupt_id`, `kind` y esquema que devolvió FastAPI; consulta `specs\003-sistema-multiagente-rag\contracts\workflow-api.md` antes de un smoke test manual. `POST` ejecuta agentes y puede persistir únicamente tras una decisión humana explícita, así que las pruebas automatizadas usan mocks.

## Pruebas automatizadas y build

```powershell
npm test
npm run build
& .\agentes\analista\.venv\Scripts\python.exe -m pytest .\agentes\analista\tests -q
```

Vitest y pytest usan dobles para APIs/modelos y no contactan OpenCode, MCP, TiDB ni Pinecone. El build produce `dist`; Vite puede avisar de tamaño de bundle y Sass deprecation.

## Estado experimental de feature 003

| Parte | Estado en esta rama |
|---|---|
| T025/T026: API FastAPI y contratos de workflow | Implementados experimentalmente; pruebas de integración con dobles. |
| T027/T028: UI React y manejo de interrupciones/checkpoint | Implementados experimentalmente; endpoints simulados por Vitest. |
| T029: documentación local y PowerShell | Actualizada para el flujo local de UI y pruebas. |
| Evidencia técnica | Procede de fixtures ficticios de ejemplo. |
| RAG/Pinecone | No integrado ni anunciado como activo. |
| T001/T002 | Pendientes de ratificación formal. |
| Render/main | Sin cambios ni despliegue por esta tarea. |

La pantalla identifica las fuentes técnicas ficticias y aclara que no hay recuperación RAG/Pinecone integrada.

## Docker local (opcional)

```powershell
docker version
docker build -t historias-multiagente .
```

Esto solo construye una imagen local; no la publica, no crea recursos de Render y no cambia el servicio desplegado.
