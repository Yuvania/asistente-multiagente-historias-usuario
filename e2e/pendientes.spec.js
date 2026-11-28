import { expect, test } from '@playwright/test';
import { USUARIO_ADMINISTRADOR, ingresarComo } from './soporte/ambiente.js';

const FLUJO_ID = '11111111-1111-4111-8111-111111111111';
const AVISO_ID = '22222222-2222-4222-8222-222222222222';

// Pendientes: lo que espera la decisión de la persona y los avisos sobre sus historias.
test.describe('Pendientes', { tag: '@pendientes' }, () => {
  test('muestra lo que espera decisión y marca un aviso como leído', async ({ page }) => {
    let listaAviso = [{
      id: AVISO_ID, tipo: 'devuelta', titulo: 'Consulta de póliza ficticia', workflow_id: FLUJO_ID,
      detalle: 'Falta el criterio de pólizas vencidas', autor: 'Product Owner de prueba', creado_en: '2030-01-02T10:00:00Z',
    }];
    const listaPorDecidir = [{
      tipo: 'por_aprobar', workflow_id: FLUJO_ID, titulo: 'Vigencia de póliza ficticia', modo: 'pre_grooming',
      creado_por: 'Analista de prueba', actualizado_en: '2030-01-02T09:00:00Z',
    }];
    let marcado = false;

    await ingresarComo(page, USUARIO_ADMINISTRADOR);
    await page.route('**/api/analista/pendientes', (route) => route.fulfill({
      status: 200, json: { por_decidir: listaPorDecidir, avisos: listaAviso, total: listaPorDecidir.length + listaAviso.length },
    }));
    await page.route(`**/api/analista/pendientes/avisos/${AVISO_ID}/leido`, (route) => {
      marcado = true;
      listaAviso = [];
      return route.fulfill({ status: 204, body: '' });
    });

    await test.step('Abre Pendientes', async () => {
      await page.goto('/pendientes', { waitUntil: 'domcontentloaded' });
      await expect(page.getByRole('heading', { level: 1, name: 'Pendientes' })).toBeVisible();
    });
    await test.step('Ve la historia por aprobar y el aviso de devolución con su motivo', async () => {
      await expect(page.getByText('Vigencia de póliza ficticia')).toBeVisible();
      await expect(page.getByRole('button', { name: 'Revisar y decidir' })).toBeVisible();
      await expect(page.getByText('Su historia fue devuelta para ajustes: Consulta de póliza ficticia')).toBeVisible();
      await expect(page.getByText('Motivo: Falta el criterio de pólizas vencidas')).toBeVisible();
    });
    await test.step('Marca el aviso como leído', async () => {
      await page.getByRole('button', { name: 'Marcar como leído' }).click();
      await expect.poll(() => marcado).toBe(true);
      await expect(page.getByText('No tiene avisos nuevos.')).toBeVisible();
    });
  });

  test('«Revisar y decidir» abre la historia en el asistente', async ({ page }) => {
    await ingresarComo(page, USUARIO_ADMINISTRADOR);
    await page.route('**/api/analista/pendientes', (route) => route.fulfill({ status: 200, json: {
      por_decidir: [{ tipo: 'por_aprobar', workflow_id: FLUJO_ID, titulo: 'Vigencia de póliza ficticia' }], avisos: [], total: 1,
    } }));
    await page.route('**/api/workflows/**', (route) => route.fulfill({ status: 404, json: { error: { code: 'WORKFLOW_NOT_FOUND' } } }));
    await page.goto('/pendientes', { waitUntil: 'domcontentloaded' });
    await page.getByRole('button', { name: 'Revisar y decidir' }).click();
    await expect(page).toHaveURL(new RegExp(`/historias/nueva\\?flujo=${FLUJO_ID}$`));
  });
});
