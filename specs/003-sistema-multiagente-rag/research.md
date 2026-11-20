# Investigación técnica — Feature 003

**Fecha**: 2026-11-19  
**Estado**: investigación para diseño; no autoriza implementación mientras la enmienda constitucional no esté aprobada.

## Decisiones y evidencia

### D-001 — Usar `StateGraph` tipado para el flujo

**Decisión propuesta**: representar las etapas como nodos, las condiciones como transiciones explícitas y el contexto de workflow como estado tipado. El usuario exige un grafo real y los dos flujos y ciclos están definidos en la especificación.

**Evidencia**: la documentación de LangGraph describe el Graph API con estado, nodos y aristas; documenta `StateGraph` como constructor principal, con estado tipado y transiciones fijas o condicionales ([Graph API de LangGraph](https://docs.langchain.com/oss/python/langgraph/graph-api)).

**Implicación**: usar nodos con límites de rol y contratos, en lugar de un `if/else` genérico que solo se presente como grafo. Verificar en pruebas el grafo compilado y las aristas autorizadas.

### D-002 — Usar `interrupt()` y reanudar con `Command(resume=...)`

**Decisión propuesta**: interrumpir en la espera de Negocio, aprobación PO y decisión humana post-grooming. Cada interrupción expone un payload serializable, su respuesta se valida como un modelo estructurado y la reanudación usa el mismo `thread_id` con `Command(resume=...)`.

**Evidencia**: la guía oficial explica que `interrupt()` pausa y guarda el estado con un checkpointer, que `Command(resume=...)` provee el valor a la llamada interrumpida, y que debe usarse el mismo ID de hilo para reanudar. También especifica que el nodo que contiene `interrupt()` vuelve a ejecutarse desde el inicio del nodo; por ello, efectos laterales antes de `interrupt()` deben evitarse o ser idempotentes ([Interrupts](https://docs.langchain.com/oss/python/langgraph/interrupts)). La respuesta estructurada de interrupción se documenta para LangGraph `>=1.2.12`; el lock actual tiene `langgraph==1.2.18`.

**Implicación**: aislar en cada nodo cualquier efecto lateral y no escribir al repositorio antes de que la persona responda. Probar reanudaciones reales del grafo con `InMemorySaver` y mocks.

### D-003 — Aceptar la pérdida de checkpoints de `InMemorySaver` en la primera versión

**Decisión propuesta**: cumplir la restricción del usuario usando `InMemorySaver`, pero describirlo como memoria del proceso, no como persistencia durable. No migrar a PostgreSQL ni añadir un servicio.

**Evidencia**: la referencia oficial confirma que `InMemorySaver` guarda checkpoints en memoria. La misma documentación lo recomienda para debugging/testing y recomienda un checkpointer persistente para uso productivo ([InMemorySaver reference](https://reference.langchain.com/python/langgraph.checkpoint/memory/InMemorySaver), [Checkpointing](https://reference.langchain.com/python/langgraph/checkpoints)).

**Implicación**: el estado se pierde al reiniciar el proceso o la instancia Render. La UI, documentación y mensajes de recuperación deben explicarlo; no se presentará como fallo de reanudación recuperable. Esta limitación queda aceptada por el requerimiento para la primera versión.

### D-004 — LangGraph ya aparece en el lock, pero no como dependencia directa

**Hallazgo del repositorio**: `agentes/analista/requirements.lock` incluye `langgraph==1.2.18` y `langgraph-checkpoint==4.3.1`; `agentes/analista/requirements.txt` no declara LangGraph de forma directa. No se ejecutó pip ni se cambió lockfile.

**Decisión propuesta**: tras el gate, declarar LangGraph como dependencia directa y mantener versiones del lock validadas; no hacer upgrades incidentalmente. Asegurar que Python de despliegue soporte el lock.

### D-005 — Separar los dos repositorios

**Hallazgo del repositorio**: `agentes/analista/memory/repositorio.py` implementa el repositorio persistente de HU y lecciones, con escrituras controladas por API. El nuevo Asesor requiere consultar un repositorio ficticio Python.

**Decisión propuesta**: mantenerlos separados. El Asesor solo consultará fixtures versionados Python/estándares mediante una allowlist de lectura y citará los elementos realmente leídos. `memory/repositorio.py` se reutilizará para guardar HU tras aprobación explícita del PO y aplicar cambios después de una decisión humana. Ningún archivo Python de la app o repositorio real se presentará como fuente ficticia.

### D-006 — Reutilizar OpenCode y observabilidad existentes

**Decisión propuesta**: todas las llamadas de modelo pasan por `agentes/analista/core/opencode_client.py`; LangChain se usa realmente para construir prompts y validar/parsear salidas; el grafo coordina. `observability.py` añade spans por etapa sin contenido de prompts/respuestas ni secretos.

**Implicación**: conservar el contrato y rutas actuales del Analista; las nuevas salidas no se mezclan con respuestas del chat actual. Las pruebas automatizadas usan mocks y no consumen cuota ni llaman OpenCode.

### D-007 — Usar la API document-index del SDK Python para embeddings integrados

**Decisión propuesta**: fijar una versión del paquete oficial `pinecone` compatible con document indexes e integrated embeddings; el mínimo documentado para `multilingual-e5-large` es SDK `10.1.0`. Declarar un campo de texto con embedding integrado, modelo `multilingual-e5-large`, y deployment managed (serverless) en AWS `us-east-1`. Antes de cualquier escritura, describir el índice y validar nombre, deployment, región, modelo, dimensión `1024` y métrica `cosine`.

**Evidencia**: Pinecone documenta el SDK Python oficial y su nomenclatura de paquetes/versiones ([SDK Python](https://docs.pinecone.io/reference/sdks/python/overview)). La guía del modelo informa que `multilingual-e5-large` produce vectores de dimensión 1,024 con similitud cosine y requiere SDK `10.1.0` o posterior para integrated embedding en índices de documentos ([modelo multilingual-e5-large](https://docs.pinecone.io/models/multilingual-e5-large)). El SDK denomina `deployment_type="managed"` al índice serverless y permite elegir cloud/region; la respuesta `describe` devuelve campos para validar configuración ([índices serverless](https://sdk.pinecone.io/python/how-to/indexes/serverless.html)).

**Implicación**: usar el API `schema`/`deployment`, no mezclar con los argumentos legacy `dimension`/`metric` del SDK v10. La configuración del modelo fija esas características y no se cambia si el índice ya existe con otra configuración. Un índice incompatible produce error controlado y no se elimina/recrea automáticamente.

### D-008 — Namespaces, documentos e IDs idempotentes

**Decisión propuesta**: un índice y seis namespaces allowlisted. Cada documento contiene `_id`, `chunk_text`, metadata de fuente/clase/cita y metadatos funcionales; las consultas declaran namespace explícito. Identificadores se derivan determinísticamente de namespace, fuente/ID original y número de fragmento. Upsert al mismo ID reemplaza el documento, lo que permite ingestas repetidas sin duplicados.

**Evidencia**: SDK v10 documenta `documents.upsert`, namespaces e IDs `_id`; documento existente con el mismo ID se reemplaza. `EmbedQuery` permite búsqueda textual usando el embedding asociado al campo ([upsert de documentos](https://sdk.pinecone.io/python/how-to/documents/schema-and-upsert.html), [búsqueda](https://sdk.pinecone.io/python/how-to/documents/search.html)).

**Implicación**: las referencias de `hu_similares.json` llevan `source_kind=simulated_reference`, no se declaran aprobadas. Solo registros con origen `RepositorioHU` y aprobación comprobada pueden usarse como base para el Gestor de Cambios. Ingestar lecciones con estado `aprobada` únicamente.

### D-009 — Fallback local explícito con estado degradado

**Decisión propuesta**: preservar las herramientas MCP actuales, que implementan búsqueda léxica local, y llamar al backend de conocimiento solo cuando su configuración y consulta estén disponibles. Si Pinecone falla, el resultado local identifica su backend y marca `degraded`; un fallo de Pinecone nunca aparece como resultado/cita de Pinecone.

**Hallazgo del código**: `agentes/analista/mcp/tools.py` ya tiene `_matches` y búsqueda local para glosario, HU similares, estándares y checklist. El repositorio `RepositorioHU` ofrece búsquedas/listados locales. Las fixtures de código permiten búsqueda local con el mismo ranking léxico, con citas de ruta de fixture.

**Implicación**: considerar Pinecone y fallback como proveedores distintos en contrato/observabilidad. Un error que afecta Pinecone no borra el estado real de la consulta local.

### D-010 — Limitar fragmentos y no ejecutar código recuperado

**Decisión propuesta**: particionar JSON, Markdown y código fuente en fragmentos deterministas bajo el máximo de tokens del modelo; la ingesta procesa texto estáticamente. Los resultados se delimitan como datos no confiables antes de pasarlos a OpenCode.

**Evidencia**: Pinecone declara máximo 507 tokens por input y hasta 96 inputs por solicitud para `multilingual-e5-large` ([modelo](https://docs.pinecone.io/models/multilingual-e5-large)). Su documentación aclara que la API mock permite probar construcción de requests/errores sin cuenta y sin llamadas a Pinecone, aunque no prueba relevancia ni read-your-writes ([mock de API](https://docs.pinecone.io/guides/production/mock-the-api)). Pinecone Local llegó al fin de vida el 7 de octubre de 2026.

**Implicación**: pruebas de recuperación/ingesta usan mocks del adapter, no Pinecone real ni Pinecone Local. La calidad semántica real se verificará únicamente en una aceptación manual autorizada separada; esta petición prohíbe llamadas reales durante pytest. El código recuperado nunca se importa, ejecuta, evalúa ni trata como instrucciones.

## Alternativas consideradas

| Alternativa | Evaluación |
|---|---|
| Un agente único con selección textual de rol | Rechazada: debilita separación de permisos, puntos de aprobación y trazabilidad de transiciones. |
| Cuatro servicios Render independientes | Rechazada: el usuario prohíbe servicios adicionales y la delegación se resuelve con nodos Python en el servicio actual. |
| Checkpointer durable en esta versión | Fuera de alcance por requerimiento explícito de `InMemorySaver`; debe proponerse en otra feature y gobernarse por separado. |
| Pinecone Local en pruebas | No usarlo: Pinecone lo retiró en octubre de 2026; las pruebas automatizadas usan un adapter mockeado como solicita la feature. |
| RAG sin Pinecone | Rechazado para este alcance actualizado: el usuario ahora requiere un índice Pinecone y el fallback local existente. |
| Acceso a repositorio real del proyecto | Rechazado: no cumple la condición del Asesor y ampliaría permisos. |

## Preguntas pendientes de diseño

- Confirmar la versión Python efectiva en el despliegue Render y su compatibilidad con el lock actual al aprobar la enmienda.
- Validar qué estructura de datos de `guardar_hu` espera el repositorio para registrar el resultado estructurado sin romper los endpoints actuales.
- Definir en revisión del equipo los límites de tamaño de la evidencia técnica y la política de expiración de IDs de workflow en memoria.
- Confirmar cómo la UI existente presenta estado de workflow y decisiones sin reemplazar Stepper, chat ni simulaciones.
- Definir el splitter determinista y cómo reconciliar fragmentos obsoletos cuando cambia un archivo fuente, limitado al namespace/ID de esa fuente.
- Confirmar qué metadata del SDK se valida con `describe()` para el campo integrado de `multilingual-e5-large`; crear esquema es inmutable y un índice incompatible debe fallar sin borrarse.
- Definir el estado UI/API para diferenciar `pinecone`, `local` y `degraded` sin exponer stack traces ni configuración sensible.

Estas preguntas no cambian el gate constitucional; resolverlas forma parte del diseño previo a implementar.
