// Ayudas comunes de las pruebas de punta a punta.
//
// Dos modos:
// - Simulado (ambiente «Pruebas», el predeterminado): la API se simula con page.route. No gasta cuota del
//   modelo ni crea datos, y da el mismo resultado en Vite (npm run test:e2e) o en el contenedor (Docker).
// - Real (ambiente «Producción», solo las pruebas @basicas): con QA_USUARIO y QA_CLAVE se ingresa a la
//   aplicación publicada con el usuario de QA y no se simula nada. Esas pruebas solo leen.
import { expect } from '@playwright/test';
import { ACCION } from '../../src/config/acciones.js';

export const MODO_REAL = Boolean(process.env.QA_USUARIO && process.env.QA_CLAVE);
export const TOKEN_PRUEBA = 'token-sintetico-e2e';
export const CLAVE_PRUEBA = 'clave-sintetica';

export const TODAS_LAS_ACCIONES = Object.values(ACCION);

export const USUARIO_ADMINISTRADOR = Object.freeze({
  id: 'usuario-admin-e2e', usuario: 'admin.prueba', nombre: 'Administración de prueba', activo: true,
  roles: [{ id: 'rol-admin-e2e', nombre: 'Administrador' }], acciones: TODAS_LAS_ACCIONES,
});

export const USUARIO_CONSULTA = Object.freeze({
  id: 'usuario-consulta-e2e', usuario: 'consulta.prueba', nombre: 'Consulta de prueba', activo: true,
  roles: [{ id: 'rol-consulta-e2e', nombre: 'Consulta' }], acciones: [ACCION.HISTORIA_VER, ACCION.LECCION_VER],
});

const json = (route, cuerpo, status = 200) => route.fulfill({ status, json: cuerpo });

// La API de lectura vacía: así ninguna prueba depende de los datos del ambiente.
export async function simularApiVacia(page, { listaHistoria = [] } = {}) {
  await page.route('**/api/analista/historias', (route) => (
    route.request().method() === 'GET' ? json(route, listaHistoria) : json(route, {})));
  await page.route('**/api/analista/repositorio/historias', (route) => json(route, []));
  await page.route('**/api/analista/repositorio/cambios**', (route) => json(route, []));
  await page.route('**/api/analista/repositorio/lecciones**', (route) => json(route, []));
  await page.route('**/api/analista/pendientes', (route) => json(route, { por_decidir: [], avisos: [], total: 0 }));
}

// Seguridad activa con un usuario. Antes de ingresar no hay sesión; con el token, la sesión es la del usuario.
export async function simularSesion(page, usuario = USUARIO_ADMINISTRADOR) {
  await page.route('**/api/analista/sesion', async (route) => {
    const request = route.request();
    if (request.method() === 'POST') {
      const { usuario: nombre, clave } = request.postDataJSON();
      if (nombre !== usuario.usuario || clave !== CLAVE_PRUEBA) {
        return json(route, { error: { code: 'SESION_REQUERIDA', message: 'Usuario o contraseña incorrectos.' } }, 401);
      }
      return json(route, { seguridad: true, usuario, token: TOKEN_PRUEBA });
    }
    const conToken = (request.headers().authorization || '') === `Bearer ${TOKEN_PRUEBA}`;
    return json(route, { seguridad: true, usuario: conToken ? usuario : null });
  });
  await page.route('**/api/analista/sesion/aprobadores', (route) => json(route, []));
}

export async function ingresar(page, nombre, clave) {
  const formulario = page.getByRole('form', { name: 'Iniciar sesión' });
  await expect(formulario).toBeVisible();
  await formulario.getByLabel('Usuario').fill(nombre);
  await formulario.getByLabel('Contraseña').fill(clave);
  await formulario.getByRole('button', { name: 'Ingresar' }).click();
}

// Ingresa como el usuario indicado (simulado) o, en modo real, con el usuario de QA.
export async function ingresarComo(page, usuario = USUARIO_ADMINISTRADOR) {
  if (MODO_REAL) {
    await page.goto('/', { waitUntil: 'domcontentloaded' });
    await ingresar(page, process.env.QA_USUARIO, process.env.QA_CLAVE);
  } else {
    await simularApiVacia(page);
    await simularSesion(page, usuario);
    await page.goto('/', { waitUntil: 'domcontentloaded' });
    await ingresar(page, usuario.usuario, CLAVE_PRUEBA);
  }
  await expect(page.getByRole('form', { name: 'Iniciar sesión' })).toBeHidden();
}

// Sin seguridad (como el desarrollo local): todo está permitido y no se pide ingresar.
export async function abrirSinSeguridad(page, ruta = '/', opciones = {}) {
  await simularApiVacia(page, opciones);
  await page.route('**/api/analista/sesion', (route) => json(route, { seguridad: false, usuario: null }));
  await page.goto(ruta, { waitUntil: 'domcontentloaded' });
}
