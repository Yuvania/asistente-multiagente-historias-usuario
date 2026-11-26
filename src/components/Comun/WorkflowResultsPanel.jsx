import React from 'react';

const GROUPS = [
  ['Módulos afectados', 'affected_modules'],
  ['Dependencias', 'dependencies'],
  ['Riesgos', 'risks'],
  ['Procesos críticos', 'critical_processes'],
];

export const WorkflowResultsPanel = ({ results, showStory = false }) => {
  if (!results) return null;
  const story = results.story;
  const assessment = results.technical_assessment;
  const observations = results.review_observations ?? story?.observations ?? [];
  const hasAssessment = Boolean(assessment);
  const listaSupuesto = results.analyst?.supuesto_validar_po ?? [];

  return (
    <section className="workflow-results" aria-label="Resultados del workflow">
      {showStory && story && (
        <div className="workflow-results__card">
          <h3>Redactor-Revisor</h3>
          <p><strong>Revisión:</strong> {story.review_status} (ronda {story.review_round + 1})</p>
          <p><strong>Como:</strong> {story.como}</p>
          <p><strong>Quiero:</strong> {story.quiero}</p>
          <p><strong>Para:</strong> {story.para}</p>
          <h4>Criterios de aceptación</h4>
          <ol>{story.criterios.map((criterion, index) => (
            <li key={`${criterion.dado}-${index}`}>
              <strong>Dado:</strong> {criterion.dado} · <strong>Cuando:</strong> {criterion.cuando} · <strong>Entonces:</strong> {criterion.entonces}
            </li>
          ))}</ol>
          <h4>Observaciones del Redactor</h4>
          {observations.length
            ? <ul>{observations.map((observation, index) => <li key={`${observation}-${index}`}>{observation}</li>)}</ul>
            : <p>Sin observaciones pendientes.</p>}
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

      {hasAssessment && (
        <div className="workflow-results__card">
          <h3>Asesor Técnico</h3>
          <p className="workflow-results__notice">
            La evidencia técnica de esta demostración procede de archivos ficticios y estándares de ejemplo.
            La recuperación RAG/Pinecone aún no está integrada.
          </p>
          {GROUPS.map(([label, key]) => (
            <div key={key}>
              <h4>{label}</h4>
              {assessment[key]?.length
                ? <ul>{assessment[key].map((item, index) => (
                  <li key={`${item.source_id}-${index}`}>
                    {item.evidence} <small>Fuente: {item.source_ref}</small>
                  </li>
                ))}</ul>
                : <p>Sin evidencia reportada.</p>}
            </div>
          ))}
          <h4>Fuentes consultadas</h4>
          {assessment.consulted_sources?.length
            ? <ul>{assessment.consulted_sources.map((source) => <li key={source.source_id}>{source.source_ref}</li>)}</ul>
            : <p>No se consultaron fuentes.</p>}
          {!!assessment.uncertainties?.length && <><h4>Incertidumbres</h4><ul>{assessment.uncertainties.map((item) => <li key={item}>{item}</li>)}</ul></>}
        </div>
      )}
    </section>
  );
};
