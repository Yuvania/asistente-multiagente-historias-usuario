import React, { useState } from 'react';
import { AlertaComponent } from './AlertaComponent';
import { BotonComponent } from './BotonComponent';
import { registroInterrupcion, textoDe } from '../../flujo/interrupciones';

// Formulario genérico de intervención humana. Qué campos muestra y qué respuesta arma lo decide el
// registro de interrupciones (src/flujo/interrupciones.jsx) según el tipo que manda el backend.
export const WorkflowInterruptionForm = ({
  interrupt, onResume, busy = false, error = '', canSubmit = true, borrador = {}, onSaveDraft,
}) => {
  // Las respuestas escritas en otra sesión y guardadas sin enviar empiezan cargadas.
  const [valor, setValor] = useState(() => ({ answers: { ...borrador }, decision: '', reason: '', lessonDecisions: {} }));
  const [draftNotice, setDraftNotice] = useState('');
  const [validationError, setValidationError] = useState('');
  if (!interrupt) return null;
  const tipo = registroInterrupcion[interrupt.kind];
  if (!tipo) {
    return <AlertaComponent type="danger" title="Intervención no reconocida">El flujo pidió una intervención que esta versión no sabe mostrar.</AlertaComponent>;
  }

  const cambiar = (parcial) => {
    setValidationError('');
    setDraftNotice('');
    setValor((actual) => ({ ...actual, ...parcial }));
  };

  const submit = async (event) => {
    event.preventDefault();
    if (busy) return;
    const resultado = tipo.construir(interrupt, valor);
    if (resultado.error) {
      setValidationError(resultado.error);
      return;
    }
    if (resultado.confirmar && typeof window !== 'undefined' && !window.confirm(resultado.confirmar)) return;
    setValidationError('');
    await onResume({ kind: interrupt.kind, interrupt_id: interrupt.interrupt_id, response: resultado.response });
  };

  const titulo = textoDe(tipo.titulo, interrupt);
  const descripcion = textoDe(tipo.descripcion, interrupt);
  const { Campos } = tipo;
  const hayPregunta = (interrupt.payload?.questions ?? []).length > 0;

  return (
    <form onSubmit={submit} className="workflow-human-form" aria-label="Intervención humana requerida">
      {titulo && <h3>{titulo}</h3>}
      {descripcion && <p>{descripcion}</p>}
      <Campos interrupt={interrupt} valor={valor} cambiar={cambiar} />

      {validationError && <AlertaComponent type="warning" title="Revise la respuesta">{validationError}</AlertaComponent>}
      {draftNotice && <AlertaComponent type="success" title="Respuestas guardadas">{draftNotice}</AlertaComponent>}
      {error && <AlertaComponent type="danger" title="No se pudo continuar">{error}</AlertaComponent>}
      <div style={{ display: 'flex', gap: '0.75rem', flexWrap: 'wrap' }}>
        <BotonComponent type="submit" variant="primary" disabled={busy || !interrupt.kind || !canSubmit}>
          {busy ? 'Enviando…' : 'Confirmar y continuar'}
        </BotonComponent>
        {onSaveDraft && tipo.borrador && hayPregunta && (
          <BotonComponent
            type="button"
            variant="secondary"
            disabled={busy}
            onClick={async () => {
              const guardado = await onSaveDraft(valor.answers);
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
