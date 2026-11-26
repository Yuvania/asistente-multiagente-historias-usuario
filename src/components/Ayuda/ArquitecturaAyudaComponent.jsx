import React from 'react';
import { TarjetaComponent } from '../Comun/TarjetaComponent';
import { TarjetaItemsAyudaComponent } from './TarjetaItemsAyudaComponent';
import {
  CAMBIO_ARQUITECTURA, CAPA_ARQUITECTURA, IA_ARQUITECTURA, PRINCIPIO_ARQUITECTURA, PRODUCCION_ARQUITECTURA,
} from '../../data/ayudaDocumentacion';

const ListaPunto = ({ lista }) => (
  <ul className="ayuda-item__puntos">
    {lista.map((texto) => <li key={texto}>{texto}</li>)}
  </ul>
);

// Cómo está construido el sistema y por qué, aunque es un prototipo, está pensado para crecer.
export const ArquitecturaAyudaComponent = () => (
  <>
    <TarjetaItemsAyudaComponent
      title="Cómo está construido"
      subtitle="Es un prototipo, pero su estructura está pensada para crecer y llegar a producción"
      items={PRINCIPIO_ARQUITECTURA}
    />
    <TarjetaItemsAyudaComponent title="Capas del sistema" subtitle="Cada capa tiene una responsabilidad" items={CAPA_ARQUITECTURA} />
    <TarjetaItemsAyudaComponent
      title="Cómo se hace un cambio"
      subtitle="Los cambios frecuentes se resuelven en un solo lugar"
      items={CAMBIO_ARQUITECTURA}
    />
    <TarjetaComponent title="Pensado para producción" subtitle="Lo que ya está resuelto aunque sea un prototipo">
      <ListaPunto lista={PRODUCCION_ARQUITECTURA} />
    </TarjetaComponent>
    <TarjetaComponent title="Preparado para programar con IA" subtitle="Para que otra persona o herramienta de IA mantenga la estructura">
      <ListaPunto lista={IA_ARQUITECTURA} />
    </TarjetaComponent>
  </>
);
