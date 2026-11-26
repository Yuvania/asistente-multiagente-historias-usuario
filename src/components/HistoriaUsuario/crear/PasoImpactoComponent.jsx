import React from 'react';
import { useAsistenteHistoria } from './AsistenteHistoriaContext';
import { AlertaComponent } from '../../Comun/AlertaComponent';
import { ArrowLeft, ArrowRight } from 'lucide-react';
import { BotonComponent } from '../../Comun/BotonComponent';
import { ImpactoNegocioComponent, WorkflowResultsPanel } from '../../Comun/WorkflowResultsPanel';
import { TarjetaComponent } from '../../Comun/TarjetaComponent';
import { WorkflowInterruptionForm } from '../../Comun/WorkflowInterruptionForm';
import { PASO } from './constantesAsistente';

// Vista de un paso del asistente. El estado y las acciones vienen del controlador (useCrearHistoria).
export const PasoImpactoComponent = () => {
  const {
    guardado,
    guardarRespuestasSinEnviar,
    resumeWorkflowInterrupt,
    setActiveStep,
    workflowBusy,
    workflowError,
    workflowResponse,
  } = useAsistenteHistoria();

  return (
    <div>
      <TarjetaComponent
        title="Paso 4 — Impacto en otros módulos"
        subtitle="El Asesor Técnico revisó qué otras funciones del sistema afecta el cambio. Revise y tome las decisiones pendientes antes de redactar la historia."
      >
        {!workflowResponse ? (
          <AlertaComponent type="info" title="Disponible con el flujo de agentes">
            En el modo manual no se revisa el impacto en otros módulos. Continúe con la historia.
          </AlertaComponent>
        ) : workflowResponse.interrupt?.kind === 'impact_decisions' ? (
          <>
            <ImpactoNegocioComponent listaImpacto={workflowResponse.interrupt.payload?.impacto_negocio ?? []} />
            <WorkflowInterruptionForm
              key={workflowResponse.interrupt.interrupt_id}
              interrupt={workflowResponse.interrupt}
              onResume={resumeWorkflowInterrupt}
              busy={workflowBusy}
              error={workflowError}
              borrador={guardado?.borrador_respuestas}
              onSaveDraft={guardado?.persistente ? guardarRespuestasSinEnviar : undefined}
            />
          </>
        ) : workflowResponse.results?.technical_assessment ? (
          <WorkflowResultsPanel results={{ technical_assessment: workflowResponse.results.technical_assessment, impact_decisions: workflowResponse.results.impact_decisions }} />
        ) : (
          <AlertaComponent type="info" title="Todavía no hay impacto">
            El Asesor Técnico revisa el impacto cuando el Analista termina y ya no quedan preguntas para Negocio.
          </AlertaComponent>
        )}

        <div style={{ display: 'flex', justifyContent: 'space-between', marginTop: '2rem', paddingTop: '1rem', borderTop: '1px solid var(--color-border)' }}>
          <BotonComponent variant="secondary" icon={ArrowLeft} onClick={() => setActiveStep(PASO.PREGUNTAS)}>
            Atrás
          </BotonComponent>
          {(!workflowResponse || workflowResponse.results?.story) && (
            <BotonComponent variant="primary" icon={ArrowRight} onClick={() => setActiveStep(PASO.HISTORIA)}>
              Historia (borrador)
            </BotonComponent>
          )}
        </div>
      </TarjetaComponent>
    </div>
  );
};
