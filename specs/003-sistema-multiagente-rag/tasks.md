# Tareas: Sistema multiagente para Historias de Usuario

**Spec**: [spec.md](spec.md)  
**Plan**: [plan.md](plan.md)  
**Estado**: T005-T021, T038 y T055-T060 implementadas y validadas localmente en modo experimental. T001 sigue abierto: PR #4 fue fusionada, pero GitHub indica que no tiene reviews y la constitucion mantiene la ratificacion pendiente. T002 se contrasto contra el texto 2.0.0, pero no se puede cerrar como ratificacion final mientras T001 siga abierto. La implementacion experimental no declara aceptacion formal de la feature.

> T005-T009 y T055-T060 se implementaron primero. Por instrucción posterior se implementó T010-T018 en modo experimental; también se creó el fixture T038 por requisito explícito del Asesor. La evidencia de GitHub no permite cerrar T001: PR #4 fue fusionada sin reviews y la constitución aún declara ratificación pendiente. T002 se revisó contra el texto 2.0.0, pero queda pendiente su cierre formal. Este avance técnico no representa aceptación formal.

## Fase 0 — Puertas de gobernanza (aceptación formal pendiente)

- [ ] T001 La [PR correctiva #4](https://github.com/gilmonge/cenfotec-curso-agentes-ia/pull/4) esta fusionada, pero GitHub registra `No reviews` y `.specify/memory/constitution.md` conserva `Ratification status: pending a human approval recorded in GitHub`. Falta aprobacion humana verificable; no se marca como completada.
- [ ] T002 Se reviso `spec.md` frente al texto constitucional 2.0.0 y no se detectaron contradicciones para esta fase; el cierre formal depende de la ratificacion verificable de T001.
- [x] T003 Ejecutar análisis de consistencia Spec Kit sobre spec, plan y tareas; corregir hallazgos documentales y registrar decisiones técnicas en `research.md` y el reporte de análisis. La discrepancia constitucional queda bloqueada por T001.
- [x] T004 Confirmar Python 3.12 desde el Dockerfile actual; fijar en el contrato requerimiento ≤4.000 caracteres, solicitud de cambio ≤2.000 y una operación activa por workflow; documentar la presentación/reanudación de interrupciones y la pérdida de checkpoint tras reinicio.

## Fase 1 - Fundamentos (alcance ejecutado por instruccion expresa; ratificacion T001 pendiente)

- [x] T005 Anadir LangGraph, `pinecone` y `langchain-pinecone` con pins compatibles con Python 3.12; validar construccion de `PineconeEmbeddings` + `PineconeVectorStore` con catalogo/indice simulados y sin red, y regenerar el lock preservando los 106 pins previos; se anadieron solo paquetes faltantes. Evidencia: `requirements.txt`, `requirements.lock`, `tests/unit/test_vector_store_dependency_contract.py`.
- [x] T006 Escribir primero pruebas unitarias de contratos tipados, serializacion del estado, ruteo y flujo nominal con dobles. Evidencia: `tests/unit/test_workflow_foundation.py`, `tests/integration/test_workflow_agent_isolation.py`.
- [x] T007 Definir estado `WorkflowState` y contratos Pydantic serializables para workflow, HU en borrador, evidencia tecnica y recomendacion de cambio; se conservan los modelos actuales del Analista. Evidencia: `core/workflow_models.py`.
- [x] T008 Implementar `StateGraph` compilado con `InMemorySaver`, ruteo explicito por modo y `WorkflowRuntime`; los IDs `thread_id` quedan internos al runtime en memoria y no se devuelven en snapshots. Evidencia: `core/workflow_graph.py` y pruebas de checkpoint.
- [x] T009 Reutilizar `core/observability.py` para spans correlacionados de etapa/agente, con metadatos operativos sin prompts o respuestas; probar backend deshabilitado y fallo de exportacion sin detener el flujo.

## Fase transversal — Configuración y aislamiento de agentes OpenCode

- [x] T055 Anadir primero pruebas con OpenCode simulado para los cuatro agentes, agente desconocido, deny-all y aislamiento de contexto/herramientas. Evidencia: `tests/unit/test_opencode_agent_selection.py`, `test_agent_registry.py` y `test_orchestrator.py`.
- [x] T056 Registrar los cuatro identificadores en `opencode.jsonc` con prompt externo, modo y permisos explicitos deny-all; prueba de estructura JSON/config en `test_agent_registry.py`.
- [x] T057 Mantener intacto el prompt del Analista y anadir prompts versionados para Redactor-Revisor, Asesor Tecnico y Gestor de Cambios con contratos, limites y herramientas backend indicadas; OpenCode permanece deny-all.
- [x] T058 Mantener deny-all en OpenCode y aplicar `MCP_TOOL_ALLOWLIST`/`AGENT_NAMESPACE_ALLOWLIST` desde el backend antes de invocar MCP; probar permisos por rol y namespace, incluidos shell/filesystem y namespaces cruzados.
- [x] T059 Extender `OpenCodeClient` para cargar/verificar el prompt del agente seleccionado y usar ese ID al crear sesion; agente desconocido o discrepancia produce error controlado sin fallback.
- [x] T060 Probar seleccion/prompt, deny-all, allowlist MCP, rechazo de acciones no autorizadas y separacion de checkpoints/contextos; pytest usa dobles, no servicios reales.

## Fase 2 — Analista y espera de Negocio (US1)

- [x] T010 Añadir pruebas de no regresión del Analista existente y pruebas de loop de preguntas, pausa y reanudación por `Command(resume=...)`. Evidencia: pruebas existentes de `run_turn` más `tests/integration/test_workflow_analyst_writer.py`.
- [x] T011 Adaptar el Analista existente como nodo sin cambiar su responsabilidad ni salida contractual. El nodo llama `orchestrator.run_turn` y valida su `AgentTurnResponse` existente.
- [x] T012 Implementar `espera_negocio` con `interrupt()` y `BusinessAnswerSubmission`; `WorkflowRuntime.resume` usa `Command(resume=...)` y vuelve a ejecutar Analista antes de decidir si continúa.

## Fase 3 — Redactor y revisión (US2)

- [x] T013 Probar Como/Quiero/Para, criterios Dado/Cuando/Entonces, salida estructurada y ausencia de decisión de aprobación. Evidencia: `tests/unit/test_redactor_revisor.py`.
- [x] T014 Integrar el prompt externo existente y nodo Python Redactor-Revisor, usando OpenCode a través del cliente existente y LangChain para prompt/parsing.
- [x] T015 Implementar revisión con contador limitado a dos rondas y observaciones estructuradas; al agotar rondas la historia queda `needs_attention` y espera al PO, sin aprobarse. Evidencia de integración con OpenCode simulado en `tests/integration/test_workflow_analyst_writer.py`.

## Fase 4 — Asesor Técnico (US3)

- [x] T016 Crear fixtures versionados de estándares y repositorio ficticio Python `ejemplos/polizas_demo/` en allowlist read-only; excluir filesystem libre y repositorios reales. El fixture de aplicación es `1.0.0` e incluye modelos, pólizas, coberturas, primas, renovaciones, pagos, validaciones y mapa de dependencias.
- [x] T017 Añadir pruebas unitarias y de integración con OpenCode/MCP simulados para evidencia consultada, falta de evidencia, referencias no recuperadas y ausencia de decisión de alcance. Evidencia: `tests/unit/test_technical_advisor.py`, `tests/integration/test_workflow_technical_advisor.py` y `tests/contract/test_technical_mcp_stdio.py`.
- [x] T018 Implementar herramientas MCP read-only y nodo LangGraph del Asesor; OpenCode usa `asesor_tecnico` y su prompt independiente. Resultado estructurado identifica módulos, dependencias, riesgos, procesos críticos, fuentes consultadas e incertidumbre; se rechazan citas no recuperadas.

## Fase 5 — Aprobación del PO y repositorio de HU (US4)

- [x] T019 Probar primero interrupción PO, aprobación humana, devoluciones a Analista/Redactor/Asesor con motivo, rechazo/detención, decisiones inválidas y cero escrituras sin aprobación. Evidencia: `tests/integration/test_workflow_po_approval.py`.
- [x] T020 Implementar `aprobacion_po` con `interrupt()`, decisión humana Pydantic y reanudación con `Command(resume=...)` sobre el mismo `thread_id`; solo enrutar a `repositorio` ante `aprobar` explícito.
- [x] T021 Implementar `repositorio` con `RepositorioHU.guardar_hu`, payload conforme al contrato real, UUID del workflow como clave idempotente y resultado de persistencia estructurado; pruebas usan un doble, sin tocar TiDB.

> Línea base previa a T019-T021 (2026-11-21): desde la raíz, `agentes/analista/.venv/Scripts/python.exe -m pytest agentes/analista/tests` ejecutó 189 pruebas, todas aprobadas (1 advertencia de LangChain MCP beta). Verificación posterior a T019-T021: 199 pruebas aprobadas, 1 advertencia; incluye pruebas con dobles, sin secretos ni servicios externos.

## Fase 6 — Gestor de Cambios y decisión humana (US5)

- [ ] T022 Añadir pruebas primero para HU no aprobada/inexistente, comparación, dos clasificaciones válidas, justificación, lecciones propuestas y ausencia de decisión del agente.
- [ ] T023 Implementar `gestor_cambios` con acceso solo a una versión aprobada y salidas `aclaracion`/`cambio_alcance` estructuradas.
- [ ] T024 Implementar `decision_humana` como interrupción y `aplicar_decision` después de reanudar; reutilizar registro de cambios/lecciones solo tras la decisión humana.

## Fase 7 — API, frontend y documentación

- [ ] T025 Añadir pruebas de contrato API para inicio, lectura de estado, respuestas inválidas, concurrencia, dependencia caída y checkpoint perdido.
- [ ] T026 Implementar rutas FastAPI para inicio/reanudación/consulta del flujo con errores controlados; no romper contratos actuales de Analista.
- [ ] T027 Añadir controles de intervención humana y vistas estructuradas en la UI React/JSX/SCSS existente; conservar rutas, Stepper, mocks y claves de localStorage actuales.
- [ ] T028 Informar en la UI que el reinicio del proceso Render pierde el checkpoint y permitir iniciar un flujo nuevo de forma clara.
- [ ] T029 Actualizar `agentes/analista/README.md`, quickstart y documentación PowerShell con instalación, arranque, health, pruebas, shutdown y troubleshooting, sin secretos.

## Fase 9 — Contrato Pinecone y configuración segura

- [ ] T033 Añadir pruebas unitarias primero para creación/validación del índice Pinecone, configuración coincidente e índice existente incompatible, usando un adapter mockeado.
- [ ] T034 Implementar `agentes/conocimiento/` con cliente Pinecone inyectable, settings no secretos y lectura de `PINECONE_API_KEY` exclusivamente desde el entorno; nunca imprimir/loggear la clave.
- [ ] T035 Crear/validar un índice vectorial denso convencional con nombre `historias-usuario`, serverless, AWS `us-east-1`, 1024 dimensiones y métrica `cosine`; usar embeddings de `PineconeEmbeddings(model="multilingual-e5-large")` y `PineconeVectorStore`. No crear document index ni configurar integrated embedding.
- [ ] T036 Añadir valores no secretos de Pinecone a `agentes/analista/.env.example` y `render.yaml`; declarar solo el nombre de la clave con `sync: false`, sin crear servicios Render adicionales ni incorporar valores secretos.

## Fase 10 - Fuentes ficticias y documentos de conocimiento

- [ ] T037 Crear primero pruebas de recuperación/fuente para los JSON existentes y la asignación a los namespaces establecidos; conservar los cuatro MCP existentes.
- [x] T038 Crear `ejemplos/polizas_demo/` en Python con modelos de póliza, servicio de pólizas, cálculo de primas, coberturas, renovaciones, pagos, validaciones y mapa de dependencias Markdown; usar escenarios completamente ficticios sin datos personales. Fixture 1.0.0, entregado como requisito explícito de T016.
- [ ] T039 Añadir pruebas de lectura estática de `.py` y `.md` que verifican rutas de fuente y aseguran que ningún módulo se importa ni ejecuta.
- [ ] T040 Implementar conversión de JSON, `RepositorioHU` y ejemplo ficticio a documentos; separar `hu_similares.json` como referencia simulada y filtrar solo HU/lecciones aprobadas desde el repositorio.
- [ ] T041 Implementar fragmentación determinista bajo el límite del embedding y IDs estables por namespace, origen y fragmento; reconciliar solo IDs de la fuente correspondiente.
- [ ] T042 Añadir pruebas que ejecutan dos ingestas con mismos documentos/IDs y verifican upserts repetibles sin duplicados, errores parciales reportados y namespaces aislados.
- [ ] T043 Implementar fuente de `RepositorioHU` usando las APIs públicas existentes para HU aprobadas y lecciones `aprobada`; no leer base de datos por SQL paralelo ni indexar propuestas/rechazos.

## Fase 11 - Ingesta y recuperacion para agentes

- [ ] T044 Implementar CLI `python -m agentes.conocimiento.ingesta --fuente todas`, que solo admite fuentes allowlisted, crea/valida el índice y reporta conteos/errores sanitizados.
- [ ] T045 Añadir pruebas primero de búsqueda semántica mockeada por los seis namespaces y prueba de que una consulta de un rol no accede a namespaces no autorizados.
- [ ] T046 Implementar retrieval read-only con mapeo agente→namespace y citas desde metadata validada; conservar `consultar_glosario`, `buscar_hu_similares`, `consultar_estandares` y `aplicar_checklist_vacios`.
- [ ] T047 Añadir herramientas MCP de búsqueda de código que solo consultan Pinecone/fuentes locales; devolver la ruta exacta del archivo recuperado.
- [ ] T048 Integrar recuperación en los cuatro agentes, manteniendo los límites de rol y `source_kind`; el Gestor solo consume HU aprobadas/lecciones aprobadas.
- [ ] T049 Implementar fallback a búsqueda local con `status=degraded`, `backend=local` cuando Pinecone falle; asegurar que errores o resultados locales nunca se etiqueten como consulta Pinecone.
- [ ] T050 Añadir pruebas de errores de Pinecone (auth, timeout, rate limit, index incompatible), fallback local y procedencia verdadera de cada fuente.

## Fase 12 - Inyeccion y documentacion

- [ ] T051 Añadir pruebas adversariales de prompt injection en JSON, Markdown y código recuperado; verificar que el contenido no cambia rol/permisos/transiciones y no se ejecuta.
- [ ] T052 Actualizar guía PowerShell, `.env.example`, `render.yaml` y documentación del paquete con índice/namespaces, comando de ingesta, estado degradado y manejo seguro de secretos.

## Fase 13 - Aceptacion final (despues de integrar Pinecone)

- [ ] T030 Ejecutar pruebas Python del backend, incluida feature 003 con mocks; registrar comando y resultado real.
- [ ] T031 Ejecutar build y pruebas frontend existentes y recorrer rutas/Stepper/chat para verificar no regresión.
- [ ] T032 Revisar ausencia de secretos, PII en logs/trazas, acceso no permitido y transiciones/autorizaciones antes de preparar PR revisada.
- [ ] T053 Ejecutar pytest completo del backend con mocks y registrar resultado; comprobar que no existe test que contacte Pinecone real.
- [ ] T054 Revisar citas/evidencia, separación de namespaces, locks de dependencias, ausencia de PII/secretos, aislamiento de agentes y no regresión del Analista antes de la PR revisada.

## Dependencias

- La ratificacion formal T001/T002 sigue pendiente; se completaron experimentalmente T005-T021, T038 y T055-T060 por instruccion expresa en esta rama, sin declarar aceptacion formal.
- Fases 2–6 dependen de fundamentos T005–T009.
- T055–T060 deben preceder la ejecución de los nodos multiagente; T055 y T060 prueban selección y aislamiento con OpenCode simulado.
- La publicación de una HU depende de T019–T021; decisiones de cambio dependen de T022–T024.
- La ratificacion formal de T001/T002 sigue pendiente. T010-T021 y el fixture T038 se implementaron por instruccion expresa en modo experimental, limitada a esta rama; esto no equivale a aceptacion formal. La ingesta e integración Pinecone siguen pendientes; pytest no realiza llamadas Pinecone.
- T037–T043 preceden a T044; T044 precede a integración de retrieval T045–T050; T051–T052 documentan la integración; T030–T032 y T053–T054 son aceptación final después de T050.
