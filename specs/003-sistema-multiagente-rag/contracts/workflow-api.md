# Contratos HTTP propuestos — Workflow multiagente

**Estado**: contrato de diseño. Las rutas definitivas deben alinearse con la API actual al reabrir la implementación después del gate constitucional.

## Agentes OpenCode

`opencode.jsonc` registra los identificadores estables `analista`, `redactor_revisor`, `asesor_tecnico` y `gestor_cambios`. Cada agente carga su propio prompt externo. OpenCode deniega permisos por defecto; solo se habilitan las herramientas MCP read-only declaradas para ese rol. Ningún agente tiene shell, acceso libre al filesystem, escritura ni acceso general a la red.

`OpenCodeClient` recibe el identificador del rol/agente para cada invocación y valida que esté configurado. No usa el agente `analista` como fallback para otra responsabilidad. Las pruebas con servidor simulado deben confirmar que cada invocación usa el agente y prompt correctos y que su contexto/herramientas no cruzan roles.

## Iniciar un workflow

`POST /api/workflows`

Entrada discriminada por modo:

- `pre_grooming`: `requirement` y un identificador de correlación nuevo.
- `post_grooming`: `approved_story_id` y `change_request`.

Validaciones: `requirement` de 1–4.000 caracteres para `pre_grooming`, `change_request` de 1–2.000 caracteres para `post_grooming`, modo permitido, referencia de HU aprobada para post-grooming, máximo de una operación activa por workflow y rechazo de campos desconocidos. Una solicitud concurrente recibe conflicto y no modifica el checkpoint.

Respuesta de diseño:

```json
{
  "workflow_id": "opaque-id",
  "status": "interrupted",
  "stage": "espera_negocio",
  "results": {
    "analyst": {
      "known": [],
      "missing": [],
      "assumed": [],
      "ambiguous": [],
      "questions": []
    }
  },
  "interrupt": {
    "kind": "business_answers",
    "payload": {},
    "response_schema": {}
  }
}
```

El ejemplo es una forma del contrato, no una respuesta hardcodeada de runtime.

## Consultar estado

`GET /api/workflows/{workflow_id}`

Devuelve etapa, estado, resultados estructurados disponibles, interrupción activa o resultado final. No devuelve estado interno no autorizado, prompt, stack trace, credenciales ni trazas.

## Reanudar intervención

`POST /api/workflows/{workflow_id}/resume`

El cuerpo contiene `interrupt_id`, tipo de respuesta y objeto de respuesta tipado según el esquema asociado a la interrupción:

- `business_answers`: respuestas a preguntas pendientes; reanuda hacia Analista.
- `po_approval`: aprobación, devolución con destino permitido y motivo, o detención.
- `change_decision`: decisión humana de aplicar, descartar o devolver según enums acordados en review.

El servicio resuelve el workflow al mismo checkpoint con `Command(resume=respuesta_validada)` y el mismo `thread_id`. Una respuesta que no corresponde a la interrupción activa se rechaza sin cambiar estado.

## Errores públicos

| HTTP | Código | Uso |
|---|---|---|
| 400 | `INVALID_INPUT` | Campos, texto, decisión o etapa de devolución inválidos. |
| 404 | `WORKFLOW_NOT_FOUND` | Workflow ausente o checkpoint perdido tras reinicio. El cliente debe iniciar un flujo nuevo. |
| 409 | `WORKFLOW_NOT_WAITING` | Existe una etapa en ejecución o no hay interrupción pendiente para reanudar. |
| 422 | `CONTRACT_INVALID` | Salida estructurada del agente no satisface el modelo esperado. |
| 503 | `DEPENDENCY_UNAVAILABLE` | OpenCode/MCP no disponible; el flujo no continúa a la siguiente etapa. |
| 504 | `WORKFLOW_TIMEOUT` | Límite de operación alcanzado; resultado incompleto no se presenta como éxito. |

Los errores no incluirán stack traces, tokens, rutas internas, texto completo de prompts ni datos personales. La política de códigos debe armonizarse con `agentes/analista/api/errors.py` durante implementación.

## Contratos de recuperación de conocimiento

El backend de conocimiento expone herramientas MCP read-only. La ingesta es un comando Python separado, no una herramienta invocable por los agentes.

### Búsqueda por rol

La solicitud incluye consulta y un `agent_role` de enum interno. El backend mapea ese rol a namespaces permitidos; el request del navegador nunca elige un namespace arbitrario.

Namespaces disponibles: `glosario`, `estandares`, `checklist`, `hu_aprobadas`, `lecciones`, `codigo`.

Salidas mínimas:

```json
{
  "status": "ok",
  "backend": "pinecone",
  "namespace": "codigo",
  "sources": [
    {
      "source_id": "stable-source-id",
      "source_kind": "fictional_python_file",
      "source_ref": "ejemplos/polizas_demo/servicios/primas.py",
      "chunk": 0,
      "score": 0.83,
      "text": "fragmento recuperado como dato no confiable"
    }
  ]
}
```

Valores permitidos de `backend`: `pinecone`, `local`, `none`. Una caída de Pinecone con búsqueda local disponible produce `status="degraded"`, `backend="local"`, fuentes únicamente locales y un error controlado sin detalles internos. Si no hay resultados locales, se devuelve `degraded` con una lista vacía. No se informa Pinecone como fuente si no completó la búsqueda.

La herramienta de código devuelve rutas relativas dentro de `ejemplos/polizas_demo/`. Los resultados de JSON y RepositorioHU incluyen archivo/ID original y `source_kind`; contenido de referencia simulada queda distinguido de contenido aprobado.

### Contrato de ingesta

Comando: `python -m agentes.conocimiento.ingesta --fuente todas`.

El comando acepta solo fuentes preconfiguradas. Su salida informa conteos leídos, validados, upserted y excluidos por namespace, IDs estables y errores sanitizados; nunca incluye la clave Pinecone, texto completo sensible, ni un estado de éxito total si hubo fallas.

El cliente lee `PINECONE_API_KEY` del entorno y limita operaciones al índice vectorial denso convencional `historias-usuario` y los seis namespaces. Se usa `PineconeEmbeddings(model="multilingual-e5-large")` para producir vectores y `PineconeVectorStore` de `langchain-pinecone` para upsert y búsqueda. La configuración del índice es serverless en AWS `us-east-1`, dimensión `1024` y métrica `cosine`. No se usa document index, mapa de campos de texto, embedding integrado ni API `documents.*`. Si el índice existente no coincide, la ingesta/búsqueda falla sin borrarlo ni recrearlo.

Upserts usan ID determinístico por namespace, origen y número de fragmento; repetir exactamente la ingesta reemplaza el mismo ID. Fuentes aprobadas provienen solo de `RepositorioHU` (HU aprobadas/lecciones aprobadas); código solo de `.py`/`.md` allowlisted bajo `ejemplos/polizas_demo/` y nunca se importa o ejecuta.

## Protección de contenido recuperado

- Todas las fuentes se delimitan como datos no confiables en el prompt del agente.
- No hay `exec`, `eval`, import dinámico, shell ni ejecución de código recuperado.
- Texto recuperado no altera sistema, permisos, namespace ni rutas del grafo.
- Citas se construyen desde metadatos validados por el backend, no desde texto libre generado por el modelo.
- Pruebas de errores Pinecone, namespaces, citación e inyección usan adapter/mocks y nunca una cuenta Pinecone real.

## Seguridad y ciclo de vida

- Backend valida cada cuerpo con Pydantic y aplica límites de longitud y tamaño.
- Configuración no secreta: índice vectorial `historias-usuario`, cloud `aws`, región `us-east-1`, dimensión `1024`, métrica `cosine`, modelo de embeddings `multilingual-e5-large` y namespaces fijos. Las llamadas de embeddings y las operaciones vectoriales son explícitas en la aplicación; el índice no almacena configuración de integrated embeddings.
- `PINECONE_API_KEY` procede solo del entorno; `.env.example` usa un valor vacío y Render la declara `sync: false` sin incluir credencial.
- El navegador no contacta OpenCode, Langfuse ni MCP directamente.
- IDs de workflow permanecen en memoria de la interfaz; no se guardan en localStorage/sessionStorage.
- Una respuesta de PO requiere identidad/autoridad humana según el mecanismo de sesión existente; no se acepta un campo del agente como sustituto.
- El checkpointer es `InMemorySaver`: reinicio de Render elimina estado/interrupciones y la consulta devuelve `WORKFLOW_NOT_FOUND`.
- No se realizan escrituras externas ni llamadas a sistemas reales. El repositorio de HU solo recibe escritura tras una decisión humana validada.
