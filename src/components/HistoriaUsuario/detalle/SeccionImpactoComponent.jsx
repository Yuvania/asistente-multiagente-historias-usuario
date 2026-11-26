import React from 'react';
import { TarjetaComponent } from '../../Comun/TarjetaComponent';
import { ImpactoNegocioComponent } from '../../Comun/WorkflowResultsPanel';

// Impacto en otros módulos que encontró el Asesor Técnico, en lenguaje de negocio.
// Las decisiones que se tomaron sobre ese impacto están en la bitácora.
export const SeccionImpactoComponent = ({ story }) => (
  <TarjetaComponent title="Impacto en otros módulos" subtitle="Otras funciones que cambian con esta historia">
    <ImpactoNegocioComponent
      listaImpacto={story.impactoNegocio ?? []}
      titulo="Además de lo indicado en el requerimiento, este cambio afecta:"
    />
  </TarjetaComponent>
);
