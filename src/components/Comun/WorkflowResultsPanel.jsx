import React from 'react';

const ROTULO_REVISION = {
  draft: 'Borrador',
  reviewed: 'Revisada por el Redactor-Revisor',
  needs_attention: 'Requiere revisión del Product Owner',
};

// Impacto en otros módulos, en lenguaje de negocio. El detalle técnico del Asesor (archivos, líneas, código)
// se guarda para Desarrollo y no se muestra a la persona usuaria.
export const ImpactoNegocioComponent = ({ listaImpacto = [], titulo = 'Para que este cambio funcione, también hay que ajustar:' }) => {
  if (!listaImpacto.length) {
    return <p>El Asesor Técnico no encontró otras funciones afectadas además de la indicada en el requerimiento.</p>;
  }
  return (
    <>
      <h4>{titulo}</h4>
      <ul>
        {listaImpacto.map((impacto, index) => (
          <li key={`${impacto.area}-${index}`} style={{ marginBottom: '0.5rem' }}>
            <strong>{impacto.area}</strong>
            <div>Hoy: {impacto.hoy}</div>
            <div>Para que el cambio funcione: {impacto.debe}</div>
          </li>
        ))}
      </ul>
    </>
  );
};

export const WorkflowResultsPanel = ({ results, showStory = false }) => {
  if (!results) return null;
  const story = results.story;
  const listaImpacto = results.technical_assessment?.impacto_negocio ?? [];
  const listaDecision = results.impact_decisions ?? [];
  const listaSupuesto = results.analyst?.supuesto_validar_po ?? [];
  const observations = results.review_observations ?? story?.observations ?? [];

  return (
    <section className="workflow-results" aria-label="Resultados del workflow">
      {showStory && story && (
        <div className="workflow-results__card">
          <h3>Redactor-Revisor</h3>
          <p><strong>Estado:</strong> {ROTULO_REVISION[story.review_status] ?? story.review_status}</p>
          <h4>Observaciones del Redactor-Revisor</h4>
          {observations.length
            ? <ul>{observations.map((observation, index) => <li key={`${observation}-${index}`}>{observation}</li>)}</ul>
            : <p>Sin observaciones pendientes.</p>}
        </div>
      )}

      {results.technical_assessment && (
        <div className="workflow-results__card">
          <h3>Impacto en otros módulos</h3>
          <ImpactoNegocioComponent listaImpacto={listaImpacto} titulo="Además de lo indicado en el requerimiento, este cambio afecta:" />
          {listaDecision.length > 0 && (
            <>
              <h4>Decisiones tomadas</h4>
              <ul>
                {listaDecision.map((item) => (
                  <li key={item.question_id}><strong>{item.pregunta}</strong> {item.respuesta}</li>
                ))}
              </ul>
            </>
          )}
        </div>
      )}

      {listaSupuesto.length > 0 && (
        <div className="workflow-results__card">
          <h3>Supuestos a validar por el Product Owner</h3>
          <p className="workflow-results__notice">
            Negocio no confirmó estos puntos y no se le volvieron a preguntar. Valídelos antes de aprobar o devuelva la HU al Analista.
          </p>
          <ul>{listaSupuesto.map((supuesto, index) => <li key={`${supuesto}-${index}`}>{supuesto}</li>)}</ul>
        </div>
      )}
    </section>
  );
};
