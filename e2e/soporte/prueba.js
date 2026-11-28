// «test» y «expect» de las pruebas: los de Playwright más un registro automático de la consola y de la API.
// Si un caso falla, adjunta «consola-y-red» (errores de JavaScript y llamadas a /api/ que respondieron 4xx o 5xx).
// Es evidencia para el Agente de Pruebas: le ayuda a explicar por qué falló, no solo que falló.
import { test as base, expect } from '@playwright/test';

const MAXIMO_REGISTRO = 50;
const IGNORAR = /fonts\.(googleapis|gstatic)\.com/;

export const test = base.extend({
  registroNavegador: [async ({ page }, use, testInfo) => {
    const lista = [];
    const agregar = (entrada) => { if (lista.length < 200) lista.push(entrada); };
    page.on('console', (mensaje) => {
      if (mensaje.type() === 'error' && !IGNORAR.test(mensaje.text())) agregar({ tipo: 'consola', texto: mensaje.text().slice(0, 400) });
    });
    page.on('pageerror', (error) => agregar({ tipo: 'error_javascript', texto: String(error?.message ?? error).slice(0, 400) }));
    page.on('response', (respuesta) => {
      const url = new URL(respuesta.url());
      if (url.pathname.startsWith('/api/') && respuesta.status() >= 400) {
        agregar({ tipo: 'api', metodo: respuesta.request().method(), ruta: url.pathname, estado: respuesta.status() });
      }
    });
    page.on('requestfailed', (solicitud) => {
      const url = new URL(solicitud.url());
      if (url.pathname.startsWith('/api/')) {
        agregar({ tipo: 'api_sin_respuesta', metodo: solicitud.method(), ruta: url.pathname, error: solicitud.failure()?.errorText ?? '' });
      }
    });
    await use(lista);
    if (testInfo.status !== testInfo.expectedStatus && lista.length) {
      await testInfo.attach('consola-y-red', { body: JSON.stringify(lista.slice(-MAXIMO_REGISTRO), null, 2), contentType: 'application/json' });
    }
  }, { auto: true }],
});

export { expect };
