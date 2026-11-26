import React, { useState } from 'react';
import { AlertaComponent } from './AlertaComponent';
import { AreaTextoComponent } from './AreaTextoComponent';
import { BotonComponent } from './BotonComponent';

const PO_CHOICES = [
  ['aprobar', 'Aprobar HU'],
  ['devolver_analista', 'Devolver a Analista'],
  ['devolver_redactor', 'Devolver a Redactor'],
  ['devolver_asesor', 'Devolver a Asesor'],
  ['rechazar', 'Rechazar HU'],
  ['detener', 'Detener flujo'],
];

const CHANGE_CHOICES = [
  ['aplicar', 'Aceptar recomendación'],
  ['rechazar', 'Rechazar solicitud'],
  ['devolver', 'Devolver para revisión'],
];

// Preguntas que se responden con texto: las de Negocio (paso 3) y las decisiones del impacto (paso 4).
const TIPO_CON_RESPUESTA = new Set(['business_answers', 'impact_decisions']);

export const WorkflowInterruptionForm = ({
  interrupt, onResume, busy = false, error = '', canSubmit = true, borrador = {}, onSaveDraft,
}) => {
  // Respuestas escritas en otra sesión y guardadas sin enviar.
  const [answers, setAnswers] = useState(() => ({ ...borrador }));
  const [draftNotice, setDraftNotice] = useState('');
  const [decision, setDecision] = useState('');
  const [reason, setReason] = useState('');
  const [lessonDecisions, setLessonDecisions] = useState({});
  const [validationError, setValidationError] = useState('');
  if (!interrupt) return null;

  const askConfirmation = (message) => typeof window === 'undefined' || window.confirm(message);
  const submit = async (event) => {
    event.preventDefault();
    if (busy) return;
    if (TIPO_CON_RESPUESTA.has(interrupt.kind)) {
      const questions = interrupt.payload?.questions ?? [];
      const unanswered = questions.filter((question) => !String(answers[question.question_id] ?? '').trim());
      if (unanswered.length) {
        setValidationError(interrupt.kind === 'impact_decisions'
          ? 'Responda todas las decisiones pendientes antes de continuar.'
          : 'Responda todas las preguntas pendientes antes de reanudar.');
        return;
      }
      const totalLength = questions.reduce((total, question) => total + String(answers[question.question_id] ?? '').length + question.question_id.length + 4, 0);
      if (totalLength > (interrupt.payload?.max_total_chars ?? 3500)) {
        setValidationError('Las respuestas superan el límite total permitido. Resúmalas antes de continuar.');
        return;
      }
      const response = { answers: questions.map(({ question_id }) => ({
        question_id,
        answer: String(answers[question_id]).trim(),
      })) };
      setValidationError('');
      await onResume({ kind: interrupt.kind, interrupt_id: interrupt.interrupt_id, response });
      return;
    }

    if (!decision) {
      setValidationError('Seleccione una decisión.');
      return;
    }
    if (interrupt.kind === 'po_approval') {
      const returning = decision.startsWith('devolver_');
      if (returning && !reason.trim()) {
        setValidationError('Indique un motivo para devolver la HU.');
        return;
      }
      const label = PO_CHOICES.find(([value]) => value === decision)?.[1] ?? 'Confirmar decisión';
      if (!askConfirmation(`¿Confirma “${label}”?`)) return;
      setValidationError('');
      await onResume({
        kind: interrupt.kind,
        interrupt_id: interrupt.interrupt_id,
        response: { decision, ...(reason.trim() ? { reason: reason.trim() } : {}) },
      });
      return;
    }

    const returning = decision === 'devolver';
    if (returning && !reason.trim()) {
      setValidationError('Indique un motivo para devolver la solicitud.');
      return;
    }
    const label = CHANGE_CHOICES.find(([value]) => value === decision)?.[1] ?? 'Confirmar decisión';
    if (!askConfirmation(`¿Confirma “${label}”?`)) return;
    setValidationError('');
    const recommendation = interrupt.payload?.change_recommendation;
    const proposedLessons = recommendation?.lessons_proposed ?? [];
    const decisions = proposedLessons.flatMap((_, index) => lessonDecisions[index]
      ? [{ index, decision: lessonDecisions[index] }]
      : []);
    await onResume({
      kind: interrupt.kind,
      interrupt_id: interrupt.interrupt_id,
      response: {
        decision,
        ...(reason.trim() ? { reason: reason.trim() } : {}),
        ...(decision === 'aplicar' ? { lesson_decisions: decisions } : {}),
      },
    });
  };

  return (
    <form onSubmit={submit} className="workflow-human-form" aria-label="Intervención humana requerida">
      {interrupt.kind === 'business_answers' && (
        <>
          <h3>Respuestas de Negocio</h3>
          <p>El Analista espera estas respuestas antes de continuar.</p>
          {(interrupt.payload?.questions ?? []).map((question) => (
            <AreaTextoComponent
              key={question.question_id}
              id={`workflow-answer-${question.question_id}`}
              label={question.pregunta}
              required
              rows={2}
              maxLength={interrupt.payload?.max_answer_chars ?? 1000}
              value={answers[question.question_id] ?? ''}
              onChange={(event) => {
                setValidationError('');
                setDraftNotice('');
                setAnswers((current) => ({ ...current, [question.question_id]: event.target.value }));
              }}
            />
          ))}
          <p>Máximo {interrupt.payload?.max_answer_chars ?? 1000} caracteres por respuesta y {interrupt.payload?.max_total_chars ?? 3500} en total.</p>
        </>
      )}

      {interrupt.kind === 'impact_decisions' && (interrupt.payload?.questions ?? []).length > 0 && (
        <>
          <h3>Decisiones pendientes</h3>
          <p>Antes de redactar la historia hay que decidir estas reglas. Si necesita consultarlas, guarde lo que lleva y retome después.</p>
          {(interrupt.payload?.questions ?? []).map((question) => (
            <AreaTextoComponent
              key={question.question_id}
              id={`workflow-decision-${question.question_id}`}
              label={question.pregunta}
              required
              rows={2}
              maxLength={interrupt.payload?.max_answer_chars ?? 1000}
              value={answers[question.question_id] ?? ''}
              onChange={(event) => {
                setValidationError('');
                setDraftNotice('');
                setAnswers((current) => ({ ...current, [question.question_id]: event.target.value }));
              }}
            />
          ))}
        </>
      )}
      {interrupt.kind === 'impact_decisions' && (interrupt.payload?.questions ?? []).length === 0 && (
        <p>No hay decisiones pendientes. Confirme que revisó el impacto para que se redacte la historia.</p>
      )}

      {interrupt.kind === 'po_approval' && (
        <>
          <h3>Decisión explícita del Product Owner</h3>
          <label htmlFor="workflow-po-decision">Decisión</label>
          <select id="workflow-po-decision" required value={decision} onChange={(event) => setDecision(event.target.value)}>
            <option value="">Seleccione una decisión</option>
            {PO_CHOICES.map(([value, label]) => <option key={value} value={value}>{label}</option>)}
          </select>
          {decision.startsWith('devolver_') && (
            <AreaTextoComponent id="workflow-po-reason" label="Motivo de devolución" required rows={3} value={reason} onChange={(event) => setReason(event.target.value)} />
          )}
          <p>La autenticación del sitio se mantiene; la autenticación Basic compartida no verifica la identidad individual del PO.</p>
        </>
      )}

      {interrupt.kind === 'change_decision' && (
        <>
          <h3>Decisión sobre la solicitud de cambio</h3>
          <label htmlFor="workflow-change-decision">Decisión</label>
          <select id="workflow-change-decision" required value={decision} onChange={(event) => setDecision(event.target.value)}>
            <option value="">Seleccione una decisión</option>
            {CHANGE_CHOICES.map(([value, label]) => <option key={value} value={value}>{label}</option>)}
          </select>
          {decision === 'devolver' && (
            <AreaTextoComponent id="workflow-change-reason" label="Motivo de devolución" required rows={3} value={reason} onChange={(event) => setReason(event.target.value)} />
          )}
          {decision === 'aplicar' && (interrupt.payload?.change_recommendation?.lessons_proposed ?? []).map((lesson, index) => (
            <div className="workflow-human-form__lesson" key={`${lesson.category}-${index}`}>
              <p><strong>Lección propuesta:</strong> {lesson.suggested_question}</p>
              <label htmlFor={`workflow-lesson-${index}`}>Decisión sobre la lección</label>
              <select
                id={`workflow-lesson-${index}`}
                value={lessonDecisions[index] ?? ''}
                onChange={(event) => setLessonDecisions((current) => ({ ...current, [index]: event.target.value }))}
              >
                <option value="">Dejar como propuesta</option>
                <option value="aprobar">Aprobar lección</option>
                <option value="rechazar">Rechazar lección</option>
              </select>
            </div>
          ))}
        </>
      )}

      {validationError && <AlertaComponent type="warning" title="Revise la respuesta">{validationError}</AlertaComponent>}
      {draftNotice && <AlertaComponent type="success" title="Respuestas guardadas">{draftNotice}</AlertaComponent>}
      {error && <AlertaComponent type="danger" title="No se pudo continuar">{error}</AlertaComponent>}
      <div style={{ display: 'flex', gap: '0.75rem', flexWrap: 'wrap' }}>
        <BotonComponent type="submit" variant="primary" disabled={busy || !interrupt.kind || !canSubmit}>
          {busy ? 'Enviando…' : 'Confirmar y continuar'}
        </BotonComponent>
        {onSaveDraft && TIPO_CON_RESPUESTA.has(interrupt.kind) && (interrupt.payload?.questions ?? []).length > 0 && (
          <BotonComponent
            type="button"
            variant="secondary"
            disabled={busy}
            onClick={async () => {
              const guardado = await onSaveDraft(answers);
              if (guardado) setDraftNotice('Puede salir y retomarlas después desde Historias de Usuario → En proceso.');
            }}
          >
            Guardar sin enviar
          </BotonComponent>
        )}
      </div>
    </form>
  );
};
