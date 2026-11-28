// Pruebas de punta a punta con Playwright (ver docs/pruebas-automatizadas.md).
//
// - Local con Vite:   npm run test:e2e            (levanta npm run dev en el puerto 3000)
// - Con Docker:       docker compose --profile pruebas run --rm pruebas
// - En GitHub:        el workflow .github/workflows/pruebas-e2e.yml, que se arranca desde el tablero
//
// Variables: BASE_URL (aplicación ya levantada; sin ella se usa Vite), NAVEGADOR (chromium | firefox | webkit),
// REPORTE_DIR (carpeta de evidencias: HTML, JUnit, JSON, resumen, capturas y trazas).
import { defineConfig } from '@playwright/test';

const BASE_URL = process.env.BASE_URL || 'http://127.0.0.1:3000';
const NAVEGADOR = ['chromium', 'firefox', 'webkit'].includes(process.env.NAVEGADOR) ? process.env.NAVEGADOR : 'chromium';
const REPORTE_DIR = process.env.REPORTE_DIR || '';

// Cada prueba corre en los tres tamaños de la marca: web, tablet y móvil.
const LISTA_DISPOSITIVO = [
  { name: 'web', viewport: { width: 1366, height: 860 } },
  { name: 'tablet', viewport: { width: 820, height: 1180 } },
  { name: 'movil', viewport: { width: 390, height: 844 } },
];

const listaReportero = REPORTE_DIR
  ? [
    ['list'],
    ['html', { outputFolder: `${REPORTE_DIR}/html`, open: 'never' }],
    ['junit', { outputFile: `${REPORTE_DIR}/junit.xml` }],
    ['json', { outputFile: `${REPORTE_DIR}/resultado.json` }],
    ['./e2e/soporte/reportero-resumen.js', { archivo: `${REPORTE_DIR}/resumen.json` }],
  ]
  : 'list';

export default defineConfig({
  testDir: './e2e',
  testMatch: '**/*.spec.js',
  fullyParallel: false,
  workers: 1,
  retries: process.env.CI ? 1 : 0,
  timeout: 60_000,
  reporter: listaReportero,
  outputDir: REPORTE_DIR ? `${REPORTE_DIR}/artefactos` : 'test-results',
  use: {
    baseURL: BASE_URL,
    browserName: NAVEGADOR,
    headless: true,
    locale: 'es-CR',
    trace: 'retain-on-failure',
    screenshot: 'only-on-failure',
    video: REPORTE_DIR ? 'retain-on-failure' : 'off',
    navigationTimeout: 60_000,
  },
  projects: LISTA_DISPOSITIVO.map(({ name, viewport }) => ({ name, use: { viewport } })),
  webServer: process.env.BASE_URL ? undefined : {
    command: 'npm run dev -- --host 127.0.0.1',
    url: 'http://127.0.0.1:3000',
    reuseExistingServer: !process.env.CI,
    timeout: 60_000,
  },
});
