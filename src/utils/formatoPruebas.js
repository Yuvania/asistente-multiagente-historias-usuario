// Textos y formatos del tablero «Pruebas automatizadas».

export const ESTADO_EJECUCION = Object.freeze({
  solicitada: { texto: 'Solicitada', clase: 'curso' },
  en_cola: { texto: 'En cola', clase: 'curso' },
  en_ejecucion: { texto: 'En ejecución', clase: 'curso' },
  aprobada: { texto: 'Aprobada', clase: 'exito' },
  con_fallos: { texto: 'Con fallos', clase: 'peligro' },
  cancelada: { texto: 'Cancelada', clase: 'neutro' },
  error: { texto: 'Error', clase: 'advertencia' },
});

export const ESTADO_CASO = Object.freeze({
  aprobado: { texto: 'Aprobado', clase: 'exito' },
  fallido: { texto: 'Fallido', clase: 'peligro' },
  inestable: { texto: 'Inestable (pasó al reintentar)', clase: 'advertencia' },
  omitido: { texto: 'Omitido', clase: 'neutro' },
});

export const ESTADO_ACTIVO = Object.freeze(['solicitada', 'en_cola', 'en_ejecucion']);
export const estaActiva = (ejecucion) => Boolean(ejecucion && ESTADO_ACTIVO.includes(ejecucion.estado));

export const numeroEjecucion = (numero) => `#${String(numero ?? 0).padStart(3, '0')}`;

// 272000 → «04:32». Más de una hora: «1:02:05».
export const duracion = (milisegundos) => {
  if (milisegundos === null || milisegundos === undefined) return '—';
  const total = Math.max(0, Math.round(milisegundos / 1000));
  const horas = Math.floor(total / 3600);
  const minutos = Math.floor((total % 3600) / 60);
  const segundos = total % 60;
  const dos = (valor) => String(valor).padStart(2, '0');
  return horas > 0 ? `${horas}:${dos(minutos)}:${dos(segundos)}` : `${dos(minutos)}:${dos(segundos)}`;
};

export const fechaCorta = (valor) => {
  if (!valor) return '';
  const leida = new Date(valor);
  return Number.isNaN(leida.getTime()) ? '' : leida.toLocaleString('es-CR', { dateStyle: 'medium', timeStyle: 'short' });
};

// «7 de 9»: casos aprobados (incluye los que pasaron al reintentar) del total que se ejecutó.
export const casosAprobados = (resumen) => (
  resumen ? `${(resumen.aprobados ?? 0) + (resumen.inestables ?? 0)} de ${resumen.total ?? 0}` : '—'
);
