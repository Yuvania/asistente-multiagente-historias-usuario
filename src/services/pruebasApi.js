import { request } from './analystApi.js';

// Pruebas automatizadas: el backend las pide a GitHub Actions y guarda el resumen de cada ejecución.
export const pruebasApi = Object.freeze({
  leerConfiguracion: ({ signal } = {}) => request('/pruebas/configuracion', { signal }),
  listar: ({ signal } = {}) => request('/pruebas/ejecuciones', { signal }),
  ejecutar: (datos) => request('/pruebas/ejecuciones', { method: 'POST', body: datos }),
  obtener: (id, { signal } = {}) => request(`/pruebas/ejecuciones/${encodeURIComponent(id)}`, { signal }),
  repetirFallidos: (id) => request(`/pruebas/ejecuciones/${encodeURIComponent(id)}/repetir-fallidos`, { method: 'POST' }),
  cancelar: (id) => request(`/pruebas/ejecuciones/${encodeURIComponent(id)}/cancelar`, { method: 'POST' }),
});
