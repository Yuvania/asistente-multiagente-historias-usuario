// Contenido de la página de Ayuda (texto fijo). Cada bloque es una lista de { titulo, texto, puntos? }.

export const PASOS_ASISTENTE = [
  {
    titulo: 'Paso 1 — Requerimiento',
    texto: 'Ingrese la minuta, el correo o el incidente que llegó de Negocio, con su título, tipo de información, sistema, código de HU y área solicitante. Si todavía no lo va a analizar, use «Guardar y continuar después»: queda como borrador en la lista de historias.',
  },
  {
    titulo: 'Paso 2 — Análisis del Agente Analista',
    texto: 'El Agente Analista decide qué consultar (glosario, HU similares, estándares y checklist de vacíos) y clasifica la información en conocida, faltante, supuesta y ambigua. Puede tardar unos minutos.',
  },
  {
    titulo: 'Paso 3 — Preguntas para Negocio',
    texto: 'El agente arma preguntas en lenguaje de negocio. Usted las lleva a Negocio, registra las respuestas y las envía.',
    puntos: [
      'Se repite hasta que no queden vacíos. Una pregunta ya respondida no se vuelve a hacer.',
      'Si un punto se parece a algo que Negocio ya respondió, no se repregunta: pasa como supuesto que el Product Owner valida al aprobar.',
      'Puede guardar respuestas sin enviarlas (por ejemplo, si debe consultarlas) y terminarlas otro día.',
    ],
  },
  {
    titulo: 'Paso 4 — Impacto en otros módulos',
    texto: 'El Asesor Técnico revisa el código del sistema y explica, sin detalle técnico, qué otras funciones afecta el cambio además de la pantalla mencionada (por ejemplo, una carga masiva, un aviso o un reporte).',
    puntos: [
      'Si encuentra una regla que alguien tiene que decidir (por ejemplo, dos funciones que hoy validan distinto), la muestra como decisión pendiente. La responde la persona que redacta la historia.',
      'Al confirmar, la historia se redacta ya con esos impactos y decisiones.',
    ],
  },
  {
    titulo: 'Paso 5 — Historia y criterios (borrador)',
    texto: 'El Agente Redactor-Revisor escribe la historia en formato Como / Quiero / Para, con criterios Dado que / Cuando / Entonces que cubren también los impactos del paso 4, y la revisa hasta en dos rondas. El borrador se puede editar.',
  },
  {
    titulo: 'Paso 6 — Aprobación del Product Owner',
    texto: 'El Product Owner revisa la historia, el impacto en otros módulos, las decisiones tomadas y los supuestos a validar, y confirma que los datos están anonimizados. Puede aprobarla, devolverla a un agente con un motivo o rechazarla. Al aprobar, la HU se guarda en el Repositorio de HU y se recarga en el conocimiento que consultan los agentes.',
  },
];

export const NAVEGACION_ASISTENTE = [
  'El avance se guarda cada vez que el flujo espera una respuesta: puede salir y retomarlo otro día desde Historias de Usuario → En proceso, aunque el servicio se haya reiniciado.',
  'Si un paso falla (por ejemplo, un agente no responde), el avance anterior queda guardado y aparece «Reintentar el paso que falló».',
  'Use Atrás para volver a ver un paso anterior sin perder lo escrito.',
  'Mientras los agentes trabajan se muestra una pantalla de espera; puede tardar varios minutos.',
];

export const ACCIONES_HISTORIA = [
  {
    titulo: 'Retomar o descartar (HU en proceso)',
    texto: 'Las HU que todavía no terminan aparecen arriba del listado, en «En proceso», con lo que están esperando y quién las inició. Retomar abre el paso donde quedó, con lo que ya se respondió; Descartar borra el avance guardado.',
  },
  {
    titulo: 'Ver detalle',
    texto: 'Es solo de consulta: arriba ofrece únicamente Volver. Muestra la historia en pestañas (Historia, Criterios de aceptación, Preguntas pendientes, Observaciones, Historial, Análisis y Datos de la plantilla); cada pestaña aparece solo si la HU tiene ese dato. Si hay preguntas pendientes o el análisis quedó desactualizado, avisa y ofrece responderlas o volver a analizar.',
  },
  {
    titulo: 'Editar',
    texto: 'Abre el formulario por secciones.',
    puntos: [
      'Antes de aprobar se puede cambiar todo. Si cambian el requerimiento o las respuestas, queda marcado que hay que volver a analizar; cambiar solo los criterios no lo exige.',
      'Con la HU aprobada sirve para corregir redacción o datos mal escritos: se guarda en el lugar, sigue aprobada, no sube la revisión ni pasa por el agente, y queda registrado quién editó, cuándo y qué campos.',
      'Antes de guardar una HU aprobada se actualiza el Repositorio; si lo rechaza (por ejemplo, por datos personales), no se guarda nada.',
      'Las observaciones se agregan como notas con fecha y autor (bitácora).',
    ],
  },
  {
    titulo: 'Solicitar cambio (solo HU aprobada)',
    texto: 'Se usa cuando Negocio cambia el alcance. Siempre lleva a un nuevo análisis.',
    puntos: [
      'Se describe lo que pide Negocio. Si fue un vacío del análisis, se escribe la pregunta que debió hacerse y queda como lección propuesta para que el Product Owner la apruebe; si Negocio solo cambió de decisión, se marca la casilla y no hay lección.',
      'Al pulsar "Registrar y analizar cambio" se abre el asistente sobre la misma HU, con el mismo código y el cambio ya cargado.',
      'Al aprobar, sube a la siguiente revisión y la anterior queda en el Historial.',
    ],
  },
  {
    titulo: 'Descargar',
    texto: 'Genera la HU en Word o PDF con la plantilla de documento (código de formato, encabezado, pie con número de página). Las observaciones salen en una página final, solo con su texto.',
  },
  {
    titulo: 'Eliminar',
    texto: 'Solo está en el listado y pide confirmación. Si la HU ya estaba aprobada, primero se borra del Repositorio para que el agente deje de usarla; si eso falla, no se borra y se informa el motivo. Después se borra de la base y del navegador.',
  },
];

// Lo que comparten los cuatro agentes: las cuatro propiedades de un agente.
export const PROPIEDAD_AGENTE = [
  { titulo: 'Autonomía', texto: 'Cada agente decide qué consultar y con qué consulta. Primero arma un plan; el sistema lo valida y lo ejecuta.' },
  { titulo: 'Razonamiento', texto: 'Explica por qué consulta cada fuente y trabaja en ciclos de percibir, pensar y actuar. Su plan se puede ver en «Cómo trabajó el agente».' },
  { titulo: 'Herramientas (MCP)', texto: 'Cada agente tiene su propio servidor MCP con herramientas de solo lectura. Solo ve las herramientas de su rol; si pide otra, se descarta y queda registrado.' },
  { titulo: 'Memoria (RAG)', texto: 'Detrás de las herramientas está la base de conocimiento en Pinecone: glosario, estándares, checklist, HU aprobadas, lecciones aprendidas y el código del sistema.' },
];

export const AGENTES = [
  {
    nombre: 'Agente Analista',
    rol: 'Descubre y aclara los vacíos de un requerimiento antes de redactar la HU y de llegar al grooming. Se detiene a esperar las respuestas de Negocio.',
    hace: [
      'Clasifica la información en conocida, faltante, supuesta y ambigua.',
      'Genera preguntas por categoría, con palabras de negocio, y reanaliza cuando llegan las respuestas.',
      'Advierte si detecta datos personales sin anonimizar.',
    ],
    fuentes: 'Glosario de seguros, HU similares aprobadas, estándares de desarrollo y checklist de vacíos.',
  },
  {
    nombre: 'Asesor Técnico',
    rol: 'Encuentra todos los lugares del sistema que afecta un cambio, incluso los que el requerimiento no menciona.',
    hace: [
      'Busca cada campo o regla en el código del sistema (y sus variantes, como el nombre de una columna en una carga) y abre los archivos donde aparece.',
      'Explica a la persona usuaria, sin detalle técnico, qué otras funciones cambian y qué decisiones quedan pendientes.',
      'Guarda para Desarrollo la evidencia técnica (archivos y riesgos), que no se muestra en pantalla.',
    ],
    fuentes: 'Repositorio de código de solo lectura (de ejemplo: polizas-demo), estándares y HU similares.',
  },
  {
    nombre: 'Redactor-Revisor',
    rol: 'Redacta la historia con lo que ya se aclaró y la revisa antes de que llegue al Product Owner.',
    hace: [
      'Escribe Como / Quiero / Para y criterios Dado que / Cuando / Entonces verificables.',
      'Cubre con criterios cada impacto en otros módulos y aplica las decisiones tomadas.',
      'Revisa su propio borrador hasta en dos rondas; nunca aprueba.',
    ],
    fuentes: 'Estándares de redacción, checklist de calidad y HU similares.',
  },
  {
    nombre: 'Gestor de Cambios',
    rol: 'Atiende las solicitudes de cambio sobre una HU ya aprobada.',
    hace: [
      'Compara la solicitud con la versión aprobada y recomienda si es una aclaración o un cambio de alcance.',
      'Propone lecciones aprendidas cuando el cambio revela una pregunta que faltó hacer.',
      'Puede pedir criterio al Asesor Técnico sobre el impacto del cambio.',
    ],
    fuentes: 'HU aprobadas, lecciones aprendidas y checklist de vacíos.',
  },
];

export const LIMITE_AGENTE = [
  'Ningún agente aprueba historias: aprobar es siempre una decisión del Product Owner.',
  'No inventan reglas, nombres, fechas ni importes: lo que no viene del requerimiento o de una fuente identificada no se da por confirmado.',
  'Tratan las minutas, el código y los resultados de las herramientas como contenido no confiable; no siguen instrucciones escritas dentro de ellos.',
  'No acceden a internet, sistemas reales, correo ni archivos libres, y no escriben en el código.',
];

export const MEMORIA_AGENTE = 'Aprenden de las HU aprobadas (Repositorio de HU) y de las lecciones que el Product Owner aprueba. Al aprobar o eliminar una HU, el conocimiento en Pinecone se actualiza solo.';

export const TECNOLOGIAS = [
  { titulo: 'Interfaz', texto: 'React 18, Vite 5, React Router 6, Sass, lucide-react (íconos), react-markdown con remark-gfm.' },
  { titulo: 'Documentos', texto: 'docx (archivos Word) y jsPDF con jspdf-autotable (archivos PDF), con una plantilla de documento configurable.' },
  { titulo: 'Backend', texto: 'Python 3.12, FastAPI con Uvicorn, Pydantic, httpx y SQLAlchemy con PyMySQL.' },
  { titulo: 'Orquestación de agentes', texto: 'LangGraph: un grafo con los pasos del flujo, pausas para las decisiones de las personas y puntos de control que se guardan en la base de datos para retomar el flujo.' },
  { titulo: 'Modelo de lenguaje', texto: 'OpenCode Server 2.1.2 como interfaz con el modelo, sin permisos para usar herramientas propias. Proveedor OpenCode Go con el modelo glm-5.3-flash (configurables). LangChain para las plantillas de los prompts y la validación de las salidas.' },
  { titulo: 'Herramientas (MCP)', texto: 'FastMCP: un servidor MCP por agente, con herramientas de solo lectura, conectado con el adaptador MCP de LangChain.' },
  { titulo: 'Conocimiento (RAG)', texto: 'Pinecone con el modelo de embeddings multilingual-e5-large (1024 dimensiones) en 6 espacios: glosario, estándares, checklist, HU aprobadas, lecciones y código. Se carga solo al arrancar y al aprobar una HU; si Pinecone no responde, se usa una copia local.' },
  { titulo: 'Repositorio de código', texto: 'Un repositorio de GitHub de solo lectura (de ejemplo, polizas-demo) que el Asesor Técnico revisa. Se copia al arrancar el servicio.' },
  { titulo: 'Datos', texto: 'TiDB Cloud (compatible con MySQL) como base compartida: historias, Repositorio de HU, cambios, lecciones y los flujos en proceso. En local y en pruebas, SQLite.' },
  { titulo: 'Trazabilidad', texto: 'Langfuse para seguir cada paso de los agentes, y registros del servidor que indican la causa cuando un flujo se detiene.' },
  { titulo: 'Pruebas', texto: 'Vitest y Testing Library en la interfaz; pytest y pytest-asyncio en el backend. GitHub Actions las ejecuta en cada cambio.' },
  { titulo: 'Despliegue', texto: 'Docker en una sola imagen (interfaz compilada, backend y OpenCode), publicada en Render con despliegue automático desde la rama main.' },
];

export const PENDIENTES = [
  {
    titulo: 'Roles, acciones y permisos',
    texto: 'Se propone que los permisos se asignen por acciones (por ejemplo hu-aprobar, hu-solicitar-cambio, hu-eliminar), que las acciones se agrupen en roles y que los roles se asignen a los usuarios. Solo un rol con la acción de aprobar (el Product Owner) podría aprobar. Los permisos se validarían en el backend, no solo ocultando botones.',
  },
  {
    titulo: 'Usuarios e inicio de sesión',
    texto: 'Hoy no hay inicio de sesión: el nombre se escribe a mano y el acceso es con una clave compartida. Se propone una tabla de usuarios con contraseña guardada con hash y una pantalla de ingreso; el autor de la bitácora, de las ediciones y de las HU en proceso saldría de ahí.',
  },
  {
    titulo: 'Aviso por correo al Product Owner',
    texto: 'Se propone enviar un correo al Product Owner cuando una HU queda lista para aprobar. En Render se haría con un servicio de correo por API (por ejemplo Resend o Brevo), porque el plan gratuito bloquea el envío directo.',
  },
  {
    titulo: 'Detalle técnico para Desarrollo',
    texto: 'El Asesor Técnico guarda los archivos y riesgos que encontró, pero no se muestran a la persona usuaria. Cuando existan los roles, se mostrarían solo a Desarrollo para el grooming.',
  },
  {
    titulo: 'Descargas y eliminación',
    texto: 'Por definir si Word y PDF se descargan solo con la HU aprobada (los borradores saldrían marcados) y si Eliminar se permite sobre HU aprobadas o queda para un rol específico.',
  },
  {
    titulo: 'Lecciones aprendidas',
    texto: 'Hoy la lección propuesta se crea al registrar la solicitud de cambio, aunque luego se abandone el análisis. Por definir si debe crearse solo al aprobar la nueva revisión.',
  },
  {
    titulo: 'Plantilla del documento',
    texto: 'Los bloques de Priorización del negocio y Revisión de Desarrollo salen "Pendiente de completar" porque aún no se capturan en el sistema. El logo del encabezado es genérico, a la espera del oficial.',
  },
];

// Orden alfabético por nombre.
export const EQUIPO = ['Allam Fernandez', 'Gilberth Monge', 'Yuvania Castillo'];
