# Tareas: Sistema multiagente para Historias de Usuario

**Spec**: [spec.md](spec.md)  
**Plan**: [plan.md](plan.md)  
**Estado**: Draft; T003 y T004 documentales completadas. La implementación sigue bloqueada mientras T001 (PR y aprobación humana de la enmienda) esté pendiente.

> No hay tareas de código autorizadas mientras Governance no apruebe una enmienda que habilite el sistema multiagente. Todos los checks de implementación permanecen sin marcar. No afirmar ejecución de pruebas de esta feature.

## Fase 0 — Puertas de gobernanza (bloquea toda implementación)

- [ ] T001 Revisar mediante PR y aprobar humanamente la enmienda constitucional propuesta 2.0.0 en `docs/constitution-multiagent-system`; retirar el informe temporal de impacto antes de fusionar. La rama/propuesta preparada no equivale a aprobación.
- [ ] T002 Tras aprobar la enmienda, actualizar el texto final de la enmienda y volver a revisar `spec.md` contra la constitución vigente; resolver contradicciones antes de continuar.
- [x] T003 Ejecutar análisis de consistencia Spec Kit sobre spec, plan y tareas; corregir hallazgos documentales y registrar decisiones técnicas en `research.md` y el reporte de análisis. La discrepancia constitucional queda bloqueada por T001.
- [x] T004 Confirmar Python 3.12 desde el Dockerfile actual; fijar en el contrato requerimiento ≤4.000 caracteres, solicitud de cambio ≤2.000 y una operación activa por workflow; documentar la presentación/reanudación de interrupciones y la pérdida de checkpoint tras reinicio.

## Fase 1 — Fundamentos (solo tras T001–T004)

- [ ] T005 Añadir LangGraph, `pinecone` y `langchain-pinecone` con pins compatibles con Python 3.12; validar `PineconeEmbeddings` + `PineconeVectorStore` para el índice vectorial convencional y regenerar el lock sin actualizar dependencias ajenas. No fijar versiones por el requisito de document indexes. Archivos: `agentes/analista/requirements.txt`, `agentes/analista/requirements.lock`.
- [ ] T006 Escribir primero pruebas unitarias de contratos tipados, serialización del estado, transiciones y flujo nominal con mocks. Archivos: `agentes/analista/tests/unit/`, `agentes/analista/tests/integration/`.
- [ ] T007 Definir estado del workflow y contratos Pydantic, conservando los modelos/API existentes del Analista. Archivos: `agentes/analista/core/models.py` y módulos de workflow nuevos.
- [ ] T008 Implementar `StateGraph` compilado con `InMemorySaver`, estado tipado y aristas explícitas; garantizar que los IDs de hilo se mantienen solo durante la vida del proceso.
- [ ] T009 Integrar spans Langfuse correlacionados y seguros por etapa reutilizando `agentes/analista/core/observability.py`; probar degradación cuando Langfuse no está disponible.

## Fase transversal — Configuración y aislamiento de agentes OpenCode

- [ ] T055 Añadir primero pruebas unitarias con OpenCode simulado para cargar, seleccionar y ejecutar cada agente, incluyendo rechazo de agente desconocido y contextos/herramientas cruzados.
- [ ] T056 Registrar en `opencode.jsonc` los cuatro agentes con identificadores estables (`analista`, `redactor_revisor`, `asesor_tecnico`, `gestor_cambios`) y configuración explícita por agente.
- [ ] T057 Crear prompts individuales versionados fuera del código para las cuatro responsabilidades, con contrato de entrada/salida y límites de rol. Conservar el prompt actual del Analista sin cambiar su misión.
- [ ] T058 Configurar permisos mínimos por agente: denegar por defecto; permitir solo las herramientas MCP read-only de su rol; no conceder shell, filesystem libre, escritura ni acceso de red general.
- [ ] T059 Extender `OpenCodeClient` para seleccionar por identificador el agente asociado al nodo/rol y verificar configuración/prompt; un agente ausente o incompatible produce error controlado, nunca fallback silencioso a `analista`.
- [ ] T060 Añadir pruebas de ejecución e aislamiento por agente: comprobar selección del agente y prompt correctos, herramientas permitidas, rechazo de acciones no autorizadas y ausencia de contexto/salidas de otros agentes.

## Fase 2 — Analista y espera de Negocio (US1)

- [ ] T010 Añadir pruebas de no regresión del Analista existente y pruebas de loop de preguntas, pausa y reanudación por `Command(resume=...)`.
- [ ] T011 Adaptar el Analista existente como nodo sin cambiar su responsabilidad ni salida contractual. Archivos reutilizados: `agentes/analista/core/orchestrator.py`, `core/models.py`, `core/opencode_client.py`, `mcp/tools.py`.
- [ ] T012 Implementar `espera_negocio` con `interrupt()` y respuesta humana tipada; respuestas vuelven a `analista`, vacíos resueltos continúan a Redactor.

## Fase 3 — Redactor y revisión (US2)

- [ ] T013 Añadir pruebas primero para Como/Quiero/Para, criterios Dado/Cuando/Entonces, salida estructurada y ausencia de decisión de aprobación.
- [ ] T014 Crear prompt externo y nodo Python Redactor-Revisor, usando OpenCode a través del cliente existente y LangChain para prompt/parsing.
- [ ] T015 Implementar revisión con contador limitado a dos rondas y observaciones estructuradas; falla final permanece no aprobada y espera al PO.

## Fase 4 — Asesor Técnico (US3)

- [ ] T016 Crear fixtures versionados de estándares y repositorio ficticio Python en allowlist read-only; excluir filesystem libre y repositorios reales.
- [ ] T017 Añadir pruebas primero para evidencia de cada archivo realmente consultado, falta de evidencia, no invención y no decisión de alcance.
- [ ] T018 Implementar herramientas/nodo del Asesor con resultado estructurado de módulos, riesgos y procesos críticos; fuentes no consultadas no aparecen.

## Fase 5 — Aprobación del PO y repositorio de HU (US4)

- [ ] T019 Añadir pruebas primero para interrupción PO, aprobación humana, devoluciones a Analista/Redactor/Asesor, rechazo y garantía de no escritura sin aprobación.
- [ ] T020 Implementar `aprobacion_po` con `interrupt()` y validación de decisión/destino/motivo.
- [ ] T021 Implementar `repositorio` como salida de aprobado y reutilizar `agentes/analista/memory/repositorio.py`; efectuar `guardar_hu` únicamente después de decisión humana aprobatoria.

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

## Fase 10 — Fuentes ficticias y documentos de conocimiento

- [ ] T037 Crear primero pruebas de recuperación/fuente para los JSON existentes y la asignación a los namespaces establecidos; conservar los cuatro MCP existentes.
- [ ] T038 Crear `ejemplos/polizas_demo/` en Python con modelos de póliza, servicio de pólizas, cálculo de primas, coberturas, renovaciones, pagos, validaciones y mapa de dependencias Markdown; usar escenarios completamente ficticios sin datos personales.
- [ ] T039 Añadir pruebas de lectura estática de `.py` y `.md` que verifican rutas de fuente y aseguran que ningún módulo se importa ni ejecuta.
- [ ] T040 Implementar conversión de JSON, `RepositorioHU` y ejemplo ficticio a documentos; separar `hu_similares.json` como referencia simulada y filtrar solo HU/lecciones aprobadas desde el repositorio.
- [ ] T041 Implementar fragmentación determinista bajo el límite del embedding y IDs estables por namespace, origen y fragmento; reconciliar solo IDs de la fuente correspondiente.
- [ ] T042 Añadir pruebas que ejecutan dos ingestas con mismos documentos/IDs y verifican upserts repetibles sin duplicados, errores parciales reportados y namespaces aislados.
- [ ] T043 Implementar fuente de `RepositorioHU` usando las APIs públicas existentes para HU aprobadas y lecciones `aprobada`; no leer base de datos por SQL paralelo ni indexar propuestas/rechazos.

## Fase 11 — Ingesta y recuperación para agentes

- [ ] T044 Implementar CLI `python -m agentes.conocimiento.ingesta --fuente todas`, que solo admite fuentes allowlisted, crea/valida el índice y reporta conteos/errores sanitizados.
- [ ] T045 Añadir pruebas primero de búsqueda semántica mockeada por los seis namespaces y prueba de que una consulta de un rol no accede a namespaces no autorizados.
- [ ] T046 Implementar retrieval read-only con mapeo agente→namespace y citas desde metadata validada; conservar `consultar_glosario`, `buscar_hu_similares`, `consultar_estandares` y `aplicar_checklist_vacios`.
- [ ] T047 Añadir herramientas MCP de búsqueda de código que solo consultan Pinecone/fuentes locales; devolver la ruta exacta del archivo recuperado.
- [ ] T048 Integrar recuperación en los cuatro agentes, manteniendo los límites de rol y `source_kind`; el Gestor solo consume HU aprobadas/lecciones aprobadas.
- [ ] T049 Implementar fallback a búsqueda local con `status=degraded`, `backend=local` cuando Pinecone falle; asegurar que errores o resultados locales nunca se etiqueten como consulta Pinecone.
- [ ] T050 Añadir pruebas de errores de Pinecone (auth, timeout, rate limit, index incompatible), fallback local y procedencia verdadera de cada fuente.

## Fase 12 — Inyección y documentación

- [ ] T051 Añadir pruebas adversariales de prompt injection en JSON, Markdown y código recuperado; verificar que el contenido no cambia rol/permisos/transiciones y no se ejecuta.
- [ ] T052 Actualizar guía PowerShell, `.env.example`, `render.yaml` y documentación del paquete con índice/namespaces, comando de ingesta, estado degradado y manejo seguro de secretos.

## Fase 13 — Aceptación final (después de integrar Pinecone)

- [ ] T030 Ejecutar pruebas Python del backend, incluida feature 003 con mocks; registrar comando y resultado real.
- [ ] T031 Ejecutar build y pruebas frontend existentes y recorrer rutas/Stepper/chat para verificar no regresión.
- [ ] T032 Revisar ausencia de secretos, PII en logs/trazas, acceso no permitido y transiciones/autorizaciones antes de preparar PR revisada.
- [ ] T053 Ejecutar pytest completo del backend con mocks y registrar resultado; comprobar que no existe test que contacte Pinecone real.
- [ ] T054 Revisar citas/evidencia, separación de namespaces, locks de dependencias, ausencia de PII/secretos, aislamiento de agentes y no regresión del Analista antes de la PR revisada.

## Dependencias

- T001–T004 bloquean todas las fases de implementación.
- Fases 2–6 dependen de fundamentos T005–T009.
- T055–T060 deben preceder la ejecución de los nodos multiagente; T055 y T060 prueban selección y aislamiento con OpenCode simulado.
- La publicación de una HU depende de T019–T021; decisiones de cambio dependen de T022–T024.
- T033–T054 y T055–T060 dependen de T001–T004; no ejecutar ingesta real ni pruebas contra Pinecone en ningún pytest.
- T037–T043 preceden a T044; T044 precede a integración de retrieval T045–T050; T051–T052 documentan la integración; T030–T032 y T053–T054 son aceptación final después de T050.
