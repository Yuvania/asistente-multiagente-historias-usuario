// Registro de intervenciones humanas del flujo (patrón Strategy): tipo que manda el backend → formulario.
// Cuando un agente nuevo necesita que una persona decida algo, se agrega aquí una entrada con:
//   titulo        → encabezado del formulario
//   Campos        → componente con los campos (recibe interrupt, valor y cambiar)
//   construir     → arma la respuesta para el backend o devuelve { error }
//   borrador      → si se pueden guardar las respuestas sin enviar
// Ver docs/arquitectura.md y la skill «agregar-agente».
import React from 'react';
import { AreaTextoComponent } from '../components/Comun/AreaTextoComponent';

export const OPCION_PO = [
  ['aprobar', 'Aprobar HU'],
  ['devolver_analista', 'Devolver a Analista'],
  ['devolver_redactor', 'Devolver a Redactor'],
  ['devolver_asesor', 'Devolver a Asesor'],
  ['rechazar', 'Rechazar HU'],
  ['detener', 'Detener flujo'],
];

export const OPCION_CAMBIO = [
  ['aplicar', 'Aceptar recomendación'],
  ['rechazar', 'Rechazar solicitud'],
  ['devolver', 'Devolver para revisión'],
];

const listaPregunta = (interrupt) => interrupt.payload?.questions ?? [];

// Preguntas que Negocio responde con texto. Cada una trae su origen: el Analista o el Asesor Técnico.
const ES_DEL_ASESOR = (question) => question.origen === 'asesor_tecnico';

const CamposPregunta = ({ interrupt, lista, valor, cambiar }) => (
  lista.map((question) => (
    <AreaTextoComponent
      key={question.question_id}
      id={`${ES_DEL_ASESOR(question) ? 'workflow-decision' : 'workflow-answer'}-${question.question_id}`}
      label={question.pregunta}
      required
      rows={2}
      maxLength={interrupt.payload?.max_answer_chars ?? 1000}
      value={valor.answers[question.question_id] ?? ''}
      onChange={(event) => cambiar({ answers: { ...valor.answers, [question.question_id]: event.target.value } })}
    />
  ))
);

const construirRespuesta = (mensajeFaltante) => (interrupt, valor) => {
  const questions = listaPregunta(interrupt);
  if (questions.some((question) => !String(valor.answers[question.question_id] ?? '').trim())) {
    return { error: mensajeFaltante };
  }
  const total = questions.reduce(
    (suma, question) => suma + String(valor.answers[question.question_id] ?? '').length + question.question_id.length + 4, 0,
  );
  if (total > (interrupt.payload?.max_total_chars ?? 6000)) {
    return { error: 'Las respuestas superan el límite total permitido. Resúmalas antes de continuar.' };
  }
  return {
    response: { answers: questions.map(({ question_id }) => ({ question_id, answer: String(valor.answers[question_id]).trim() })) },
  };
};

// Una sola ronda para Negocio: primero las preguntas del Analista y después las decisiones del Asesor.
const CamposRespuestaNegocio = ({ interrupt, valor, cambiar }) => {
  const listaAnalista = listaPregunta(interrupt).filter((question) => !ES_DEL_ASESOR(question));
  const listaAsesor = listaPregunta(interrupt).filter(ES_DEL_ASESOR);
  const separar = listaAnalista.length > 0 && listaAsesor.length > 0;
  return (
    <>
      {separar && <h4>Preguntas del Analista</h4>}
      <CamposPregunta interrupt={interrupt} lista={listaAnalista} valor={valor} cambiar={cambiar} />
      {listaAsesor.length > 0 && (
        <>
          <h4>Decisiones sobre el impacto en otros módulos (Asesor Técnico)</h4>
          <CamposPregunta interrupt={interrupt} lista={listaAsesor} valor={valor} cambiar={cambiar} />
        </>
      )}
    </>
  );
};

const SelectorDecision = ({ id, lista, valor, cambiar }) => (
  <>
    <label htmlFor={id}>Decisión</label>
    <select id={id} required value={valor.decision} onChange={(event) => cambiar({ decision: event.target.value })}>
      <option value="">Seleccione una decisión</option>
      {lista.map(([opcion, etiqueta]) => <option key={opcion} value={opcion}>{etiqueta}</option>)}
    </select>
  </>
);

const Motivo = ({ id, valor, cambiar }) => (
  <AreaTextoComponent id={id} label="Motivo de devolución" required rows={3} value={valor.reason} onChange={(event) => cambiar({ reason: event.target.value })} />
);

const conMotivo = (valor) => (valor.reason.trim() ? { reason: valor.reason.trim() } : {});
const etiquetaDe = (lista, decision) => lista.find(([opcion]) => opcion === decision)?.[1] ?? 'Confirmar decisión';

export const registroInterrupcion = Object.freeze({
  business_answers: {
    titulo: 'Respuestas de Negocio',
    descripcion: 'El Analista y el Asesor Técnico esperan estas respuestas antes de redactar la historia.',
    Campos: ({ interrupt, valor, cambiar }) => (
      <>
        <CamposRespuestaNegocio interrupt={interrupt} valor={valor} cambiar={cambiar} />
        <p>Máximo {interrupt.payload?.max_answer_chars ?? 1000} caracteres por respuesta y {interrupt.payload?.max_total_chars ?? 6000} en total.</p>
      </>
    ),
    construir: construirRespuesta('Responda todas las preguntas pendientes antes de reanudar.'),
    borrador: true,
  },
  po_approval: {
    titulo: 'Decisión explícita del Product Owner',
    Campos: ({ valor, cambiar }) => (
      <>
        <SelectorDecision id="workflow-po-decision" lista={OPCION_PO} valor={valor} cambiar={cambiar} />
        {valor.decision.startsWith('devolver_') && <Motivo id="workflow-po-reason" valor={valor} cambiar={cambiar} />}
        <p>La autenticación del sitio se mantiene; la autenticación Basic compartida no verifica la identidad individual del PO.</p>
      </>
    ),
    construir: (_interrupt, valor) => {
      if (!valor.decision) return { error: 'Seleccione una decisión.' };
      if (valor.decision.startsWith('devolver_') && !valor.reason.trim()) return { error: 'Indique un motivo para devolver la HU.' };
      return {
        confirmar: `¿Confirma “${etiquetaDe(OPCION_PO, valor.decision)}”?`,
        response: { decision: valor.decision, ...conMotivo(valor) },
      };
    },
  },
  change_decision: {
    titulo: 'Decisión sobre la solicitud de cambio',
    Campos: ({ interrupt, valor, cambiar }) => (
      <>
        <SelectorDecision id="workflow-change-decision" lista={OPCION_CAMBIO} valor={valor} cambiar={cambiar} />
        {valor.decision === 'devolver' && <Motivo id="workflow-change-reason" valor={valor} cambiar={cambiar} />}
        {valor.decision === 'aplicar' && (interrupt.payload?.change_recommendation?.lessons_proposed ?? []).map((lesson, index) => (
          <div className="workflow-human-form__lesson" key={`${lesson.category}-${index}`}>
            <p><strong>Lección propuesta:</strong> {lesson.suggested_question}</p>
            <label htmlFor={`workflow-lesson-${index}`}>Decisión sobre la lección</label>
            <select
              id={`workflow-lesson-${index}`}
              value={valor.lessonDecisions[index] ?? ''}
              onChange={(event) => cambiar({ lessonDecisions: { ...valor.lessonDecisions, [index]: event.target.value } })}
            >
              <option value="">Dejar como propuesta</option>
              <option value="aprobar">Aprobar lección</option>
              <option value="rechazar">Rechazar lección</option>
            </select>
          </div>
        ))}
      </>
    ),
    construir: (interrupt, valor) => {
      if (!valor.decision) return { error: 'Seleccione una decisión.' };
      if (valor.decision === 'devolver' && !valor.reason.trim()) return { error: 'Indique un motivo para devolver la solicitud.' };
      const lessonDecisions = (interrupt.payload?.change_recommendation?.lessons_proposed ?? [])
        .flatMap((_, index) => (valor.lessonDecisions[index] ? [{ index, decision: valor.lessonDecisions[index] }] : []));
      return {
        confirmar: `¿Confirma “${etiquetaDe(OPCION_CAMBIO, valor.decision)}”?`,
        response: {
          decision: valor.decision,
          ...conMotivo(valor),
          ...(valor.decision === 'aplicar' ? { lesson_decisions: lessonDecisions } : {}),
        },
      };
    },
  },
});

export const textoDe = (campo, interrupt) => (typeof campo === 'function' ? campo(interrupt) : campo);
