import { expect, test } from '@playwright/test';
import { USUARIO_ADMINISTRADOR, ingresarComo } from './soporte/ambiente.js';

// El propio tablero «Pruebas automatizadas», con la API simulada (no arranca GitHub Actions).
const EJECUCION_ID = '33333333-3333-4333-8333-333333333333';
const NUEVA_ID = '44444444-4444-4444-8444-444444444444';

const CONFIGURACION = {
  configurado: true, faltante: [], repositorio: 'equipo/historias', rama: 'main', url_produccion: null,
  lista_alcance: [
    { codigo: 'regresion', nombre: 'Todos los módulos (regresión)', descripcion: 'Todas las pruebas.', permite_produccion: false },
    { codigo: 'basicas', nombre: 'Solo las básicas (smoke)', descripcion: 'Ingreso y pantallas.', permite_produccion: true },
    { codigo: 'historias', nombre: 'Crear historia (asistente)', descripcion: 'Asistente de 5 pasos.', permite_produccion: false },
  ],
  lista_ambiente: [
    { codigo: 'pruebas', nombre: 'Pruebas', descripcion: 'API simulada.' },
    { codigo: 'produccion', nombre: 'Producción (solo lectura)', descripcion: 'Usuario de QA.' },
  ],
  lista_navegador: [{ codigo: 'chromium', nombre: 'Chromium' }, { codigo: 'firefox', nombre: 'Firefox' }],
  lista_dispositivo: [],
};

const PASOS_TERMINADOS = [
  { codigo: 'solicitud', nombre: 'Solicitud registrada', estado: 'completa' },
  { codigo: 'preparacion', nombre: 'Se preparó el navegador y la aplicación', estado: 'completa' },
  { codigo: 'ejecucion', nombre: 'Pruebas en ejecución', estado: 'fallida' },
  { codigo: 'publicacion', nombre: 'Publicación de resultados', estado: 'completa' },
];

const TERMINADA = {
  id: EJECUCION_ID, numero: 12, estado: 'con_fallos', alcance: 'historias', alcance_nombre: 'Crear historia (asistente)',
  navegador: 'chromium', navegador_nombre: 'Chromium', ambiente: 'pruebas', ambiente_nombre: 'Pruebas', solo_fallidos: false,
  iniciada_por: 'Administración de prueba', run_url: 'https://github.com/equipo/historias/actions/runs/1', mensaje: null,
  pasos: PASOS_TERMINADOS, creado_en: '2030-01-02T10:00:00Z', finalizado_en: '2030-01-02T10:05:00Z',
  resumen: { total: 3, aprobados: 2, fallidos: 1, omitidos: 0, inestables: 0, duracion_ms: 272000 },
};

const CASOS = [
  { id: 'c1', titulo: 'El PO aprueba la historia en el paso 5', modulo: 'historias', dispositivo: 'movil', estado: 'fallido', duracion_ms: 41000,
    error: 'Esperaba ver «Historia aprobada» y no apareció en 10 s.', pasos: ['Ingresa como Product Owner', 'Elige Aprobar historia'] },
  { id: 'c2', titulo: 'El analista registra el requerimiento', modulo: 'historias', dispositivo: 'web', estado: 'aprobado', duracion_ms: 12000, pasos: [] },
  { id: 'c3', titulo: 'Un analista no ve la opción Aprobar historia', modulo: 'historias', dispositivo: 'web', estado: 'aprobado', duracion_ms: 9000, pasos: [] },
];

const EN_CURSO = {
  ...TERMINADA, id: NUEVA_ID, numero: 13, estado: 'en_ejecucion', resumen: null, finalizado_en: null,
  alcance: 'regresion', alcance_nombre: 'Todos los módulos (regresión)',
  pasos: [
    { codigo: 'solicitud', nombre: 'Solicitud registrada', estado: 'completa' },
    { codigo: 'preparacion', nombre: 'Se preparó el navegador y la aplicación', estado: 'completa' },
    { codigo: 'ejecucion', nombre: 'Pruebas en ejecución', estado: 'en_curso' },
    { codigo: 'publicacion', nombre: 'Publicación de resultados', estado: 'pendiente' },
  ],
};

const panelCon = (lista, activa = null) => ({
  indicador: { ultima: { id: EJECUCION_ID, numero: 12, total: 3, aprobados: 2, fallidos: 1, duracion_ms: 272000 }, tasa_exito: 50 },
  activa, lista_ejecucion: lista,
});

test.describe('Pruebas automatizadas', { tag: '@pruebas' }, () => {
  test('pide una ejecución y muestra su avance', async ({ page }) => {
    let solicitud = null;
    await ingresarComo(page, USUARIO_ADMINISTRADOR);
    await page.route('**/api/analista/pruebas/configuracion', (route) => route.fulfill({ status: 200, json: CONFIGURACION }));
    await page.route('**/api/analista/pruebas/ejecuciones', (route) => {
      if (route.request().method() === 'POST') {
        solicitud = route.request().postDataJSON();
        return route.fulfill({ status: 201, json: EN_CURSO });
      }
      return route.fulfill({ status: 200, json: solicitud ? panelCon([EN_CURSO, TERMINADA], EN_CURSO) : panelCon([TERMINADA]) });
    });

    await test.step('Abre el tablero y ve los indicadores de la última ejecución', async () => {
      await page.goto('/pruebas', { waitUntil: 'domcontentloaded' });
      await expect(page.getByRole('heading', { level: 1, name: 'Pruebas automatizadas' })).toBeVisible();
      const indicadores = page.getByLabel('Indicadores');
      await expect(indicadores.getByText('#012')).toBeVisible();
      await expect(indicadores.getByText('04:32')).toBeVisible();
      await expect(page.getByRole('cell', { name: '2 de 3' })).toBeVisible();
    });

    await test.step('Elige regresión en Chromium y ejecuta', async () => {
      const formulario = page.getByRole('form', { name: 'Nueva ejecución' });
      await formulario.getByLabel('Qué probar').selectOption('regresion');
      await formulario.getByLabel('Navegador').selectOption('chromium');
      await formulario.getByRole('button', { name: 'Ejecutar pruebas' }).click();
      await expect.poll(() => solicitud).toEqual({ alcance: 'regresion', ambiente: 'pruebas', navegador: 'chromium' });
    });

    await test.step('Ve la ejecución en curso y su avance', async () => {
      await expect(page.getByRole('heading', { name: /Ejecución actual\s*#013/ })).toBeVisible();
      const linea = page.getByRole('list', { name: 'Avance de la ejecución' });
      await expect(linea.getByText('Pruebas en ejecución')).toBeVisible();
      await expect(page.getByRole('button', { name: 'Ejecutar pruebas' })).toBeDisabled();
    });
  });

  test('en producción solo ofrece las pruebas básicas', async ({ page }) => {
    await ingresarComo(page, USUARIO_ADMINISTRADOR);
    await page.route('**/api/analista/pruebas/configuracion', (route) => route.fulfill({ status: 200, json: CONFIGURACION }));
    await page.route('**/api/analista/pruebas/ejecuciones', (route) => route.fulfill({ status: 200, json: panelCon([]) }));
    await page.goto('/pruebas', { waitUntil: 'domcontentloaded' });
    const formulario = page.getByRole('form', { name: 'Nueva ejecución' });
    await formulario.getByLabel('Ambiente').selectOption('produccion');
    await expect(formulario.getByLabel('Qué probar').locator('option')).toHaveText(['Solo las básicas (smoke)']);
  });

  test('los resultados muestran el caso fallido y permiten repetir solo los fallidos', async ({ page }) => {
    let repetido = false;
    await ingresarComo(page, USUARIO_ADMINISTRADOR);
    await page.route('**/api/analista/pruebas/configuracion', (route) => route.fulfill({ status: 200, json: CONFIGURACION }));
    await page.route('**/api/analista/pruebas/ejecuciones', (route) => route.fulfill({ status: 200, json: panelCon([TERMINADA]) }));
    await page.route(`**/api/analista/pruebas/ejecuciones/${EJECUCION_ID}`, (route) => route.fulfill({ status: 200, json: { ...TERMINADA, casos: CASOS } }));
    await page.route(`**/api/analista/pruebas/ejecuciones/${EJECUCION_ID}/repetir-fallidos`, (route) => {
      repetido = true;
      return route.fulfill({ status: 201, json: EN_CURSO });
    });

    await test.step('Abre los resultados desde el historial', async () => {
      await page.goto('/pruebas', { waitUntil: 'domcontentloaded' });
      await page.getByRole('link', { name: 'Ver resultados de la ejecución #012' }).click();
      await expect(page.getByRole('heading', { level: 1, name: /Ejecución #012/ })).toBeVisible();
    });
    await test.step('Filtra los fallidos y ve el error', async () => {
      await page.getByRole('button', { name: /Fallidos/ }).click();
      const casos = page.getByRole('list', { name: 'Casos' });
      await expect(casos.getByRole('listitem')).toHaveCount(1);
      await expect(casos.getByText('Esperaba ver «Historia aprobada»').first()).toBeVisible();
    });
    await test.step('Vuelve a ejecutar solo los fallidos', async () => {
      await page.getByRole('button', { name: 'Volver a ejecutar los fallidos' }).click();
      await expect.poll(() => repetido).toBe(true);
      await expect(page).toHaveURL(/\/pruebas$/);
    });
  });
});
