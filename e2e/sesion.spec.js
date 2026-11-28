import { expect, test } from '@playwright/test';
import {
  CLAVE_PRUEBA, USUARIO_ADMINISTRADOR, USUARIO_CONSULTA, ingresar, ingresarComo, simularApiVacia, simularSesion,
} from './soporte/ambiente.js';

// Inicio de sesión y menú por acciones, con la API simulada.
test.describe('Inicio de sesión', { tag: '@inicio-sesion' }, () => {
  test('con la contraseña incorrecta no ingresa y lo explica', async ({ page }) => {
    await simularApiVacia(page);
    await simularSesion(page, USUARIO_ADMINISTRADOR);
    await page.goto('/', { waitUntil: 'domcontentloaded' });

    await test.step('Ingresa una contraseña incorrecta', () => ingresar(page, USUARIO_ADMINISTRADOR.usuario, 'otra-clave'));
    await test.step('Ve el aviso y sigue en el ingreso', async () => {
      await expect(page.getByText('No se pudo ingresar')).toBeVisible();
      await expect(page.getByRole('form', { name: 'Iniciar sesión' })).toBeVisible();
    });

    await test.step('Con la contraseña correcta ingresa', async () => {
      await ingresar(page, USUARIO_ADMINISTRADOR.usuario, CLAVE_PRUEBA);
      await expect(page.getByRole('button', { name: `Usuario: ${USUARIO_ADMINISTRADOR.nombre}. Cerrar sesión` })).toBeVisible();
    });
  });

  test('el administrador ve todas las opciones del menú', async ({ page }) => {
    await ingresarComo(page, USUARIO_ADMINISTRADOR);
    const menu = page.getByRole('navigation', { name: 'Menú principal' });
    for (const opcion of ['Inicio', 'Pendientes', 'Historias de usuario', 'Nueva historia', 'Pruebas', 'Mantenimiento', 'Ayuda']) {
      await expect(menu.getByRole('link', { name: opcion, exact: true })).toBeVisible();
    }
  });

  test('un usuario de consulta no ve crear, pruebas ni mantenimiento', async ({ page }) => {
    await ingresarComo(page, USUARIO_CONSULTA);
    const menu = page.getByRole('navigation', { name: 'Menú principal' });
    await expect(menu.getByRole('link', { name: 'Historias de usuario', exact: true })).toBeVisible();
    for (const opcion of ['Nueva historia', 'Pruebas', 'Mantenimiento']) {
      await expect(menu.getByRole('link', { name: opcion, exact: true })).toHaveCount(0);
    }
  });
});
