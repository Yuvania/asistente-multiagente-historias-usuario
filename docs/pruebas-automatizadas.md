# Pruebas automatizadas (Playwright)

Pruebas de punta a punta que abren la aplicación en un navegador real y la recorren como una persona. Cada caso corre en tres tamaños: **web** (1366 px), **tablet** (820 px) y **móvil** (390 px).

Se pueden correr de tres formas, siempre con las mismas pruebas de `e2e/`:

| Dónde | Cómo | Para qué |
|---|---|---|
| Tablero de la aplicación | Pestaña **Pruebas** → Ejecutar pruebas | El día a día: cualquiera con la acción «Ejecutar pruebas automatizadas» |
| Cualquier computadora con Docker | `docker compose --profile pruebas run --rm pruebas` | Probar antes de subir un cambio, sin instalar Node ni navegadores |
| Desarrollo con Vite | `npm run test:e2e` | Escribir pruebas nuevas |

## Cómo funciona el tablero

```
Tablero (Render) ──token──▶ GitHub Actions: pruebas-e2e.yml
      ▲                          │ 1. docker compose build (app + pruebas)
      │ avance y resumen         │ 2. levanta la aplicación (API simulada)
      └──────────────────────────┤ 3. Playwright: web, tablet y móvil
                                 └ 4. publica resumen.json y las evidencias
```

1. La persona elige **qué probar**, el **ambiente** y el **navegador**. Solo hay una ejecución a la vez.
2. El backend (`agentes/pruebas/`) registra la ejecución (#013) y arranca el workflow con un token de GitHub.
3. Mientras el tablero está abierto, el backend consulta a GitHub cada pocos segundos: el estado y los pasos («Preparar…», «Ejecutar…», «Publicar…») forman la línea de tiempo.
4. Al terminar descarga el artefacto `resumen-<id>` (el `resumen.json` que escribe `e2e/soporte/reportero-resumen.js`), lo valida y lo guarda en la tabla `prueba_ejecucion`.
5. Las evidencias completas quedan en GitHub, en el artefacto `evidencias-<id>`: reporte HTML, JUnit, JSON y, de cada fallo, captura, video y traza (se abre en [trace.playwright.dev](https://trace.playwright.dev)). Se conservan 30 días.

**¿Por qué en GitHub y no en Render?** Chromium le quitaría memoria a la aplicación en vivo (el plan tiene 2 GB) y las evidencias se borrarían con cada despliegue. En repositorios públicos los minutos de Actions no tienen costo.

### Ambientes

- **Pruebas** (predeterminado): GitHub levanta la aplicación en Docker y las pruebas simulan la API con `page.route`. No gastan cuota del modelo, no crean datos y dan el mismo resultado siempre.
- **Producción (solo lectura)**: solo las **básicas**, contra la aplicación publicada (`APP_URL` o `RENDER_EXTERNAL_URL`), ingresando con el usuario de QA. Solo leen: ingresar, abrir cada pantalla principal y salir.

### Suites

| Alcance | Etiqueta | Qué cubre |
|---|---|---|
| Todos los módulos (regresión) | — | Todas las pruebas |
| Solo las básicas (smoke) | `@basicas` | Ingreso, pantallas principales y salida (también en producción) |
| Inicio de sesión | `@inicio-sesion` | Clave incorrecta, ingreso y menú según las acciones del rol |
| Crear historia (asistente) | `@historias` | Requerimiento, preguntas a Negocio, historia y aprobación del PO |
| Cambios a historias aprobadas | `@cambios` | Gestor de Cambios y registro manual |
| Pendientes | `@pendientes` | Lo que espera decisión y avisos |
| Mantenimiento | `@mantenimiento` | Usuarios, roles y acciones con nombres legibles |
| Exportar Word y PDF | `@exportar` | Descarga de la historia aprobada |
| Pruebas automatizadas | `@pruebas` | El propio tablero |

El registro único es `agentes/pruebas/catalogo_pruebas.py`. Una prueba de estructura (`test_pruebas.py`) revisa que coincida con las opciones del workflow y con las etiquetas de `e2e/`.

## Configuración (una sola vez)

La hace quien administra el repositorio desde el que Render despliega. **Para pasar de un repositorio a otro (por ejemplo, del de un compañero al propio) solo se cambia el token**: Render le dice a la aplicación de qué repositorio y rama salió (`RENDER_GIT_REPO_SLUG` y `RENDER_GIT_BRANCH`).

1. **Token en GitHub** (lo crea el dueño del repositorio): GitHub → *Settings* → *Developer settings* → *Personal access tokens* → *Fine-grained tokens* → *Generate new token*.
   - *Repository access*: **Only select repositories** → el repositorio de la aplicación.
   - *Permissions* → *Repository permissions* → **Actions: Read and write**. Nada más.
   - Elija una fecha de vencimiento y guárdelo: GitHub lo muestra una sola vez.
2. **Render** → el servicio → *Environment* → agregue `GITHUB_PRUEBAS_TOKEN` con el token → *Save and deploy*.
3. **Para el ambiente Producción** (opcional):
   - En la aplicación, Mantenimiento → *Nuevo usuario* de QA con el rol **Consulta**.
   - En GitHub → *Settings* → *Secrets and variables* → *Actions* → *New repository secret*: `QA_USUARIO` y `QA_CLAVE`.
4. **Permiso en la aplicación**: el Administrador tiene las acciones nuevas «Acceder a Pruebas automatizadas» y «Ejecutar pruebas automatizadas». Asígnelas en Mantenimiento a los roles que deban verlas o ejecutarlas.

El token nunca se envía al navegador ni se escribe en los registros. Las claves de QA solo viven en los Secrets de GitHub.

Fuera de Render (por ejemplo, con Docker en una computadora), además del token se indican `GITHUB_PRUEBAS_REPOSITORIO` (`dueño/repositorio`) y `GITHUB_PRUEBAS_RAMA`.

## En cualquier computadora con Docker

Requisito: Docker Desktop (Windows o Mac) o Docker Engine con Compose (Linux).

```powershell
Copy-Item .env.docker.example .env.docker      # opcional: claves del modelo, base de datos, etc.
docker compose up --build                       # la aplicación en http://localhost:10000
docker compose --profile pruebas run --rm pruebas                  # todas las pruebas
docker compose --profile pruebas run --rm pruebas --grep @basicas  # una suite
docker compose --profile pruebas run --rm -e NAVEGADOR=firefox pruebas
docker compose down                             # detener (los datos quedan en el volumen «datos»)
```

Las evidencias quedan en `reportes-pruebas/` (abra `reportes-pruebas/html/index.html`). Las imágenes son las mismas que usa GitHub Actions: lo que pasa en su computadora pasa en GitHub.

## Escribir una prueba

- Un archivo `e2e/<modulo>.spec.js`. Cada `test` o `test.describe` de primer nivel lleva la etiqueta de su suite: `test.describe('Pendientes', { tag: '@pendientes' }, () => { ... })`.
- Use `e2e/soporte/ambiente.js`: `ingresarComo(page, usuario)`, `simularSesion`, `simularApiVacia` y `abrirSinSeguridad`. Simule la API con `page.route`; nunca dependa de datos del ambiente.
- Busque los elementos como lo haría una persona: `getByRole`, `getByLabel`, `getByText`. Nada de clases CSS.
- Use `test.step('Abre Pendientes', ...)`: los pasos aparecen en el tablero cuando un caso falla.
- Solo datos sintéticos: nada real del negocio ni datos personales.
- Una prueba `@basicas` debe funcionar también en producción: solo lee y no asume datos.

## Archivos

| Archivo | Qué es |
|---|---|
| `e2e/*.spec.js` | Las pruebas, por módulo |
| `e2e/soporte/` | Ayudas comunes y el reportero que escribe `resumen.json` |
| `e2e/Dockerfile` | Imagen de las pruebas (Playwright con Chromium, Firefox y WebKit) |
| `playwright.config.js` | Proyectos web, tablet y móvil; `BASE_URL`, `NAVEGADOR` y `REPORTE_DIR` |
| `docker-compose.yml` | Servicios `app` (la aplicación) y `pruebas` |
| `.github/workflows/pruebas-e2e.yml` | El workflow que arranca el tablero |
| `agentes/pruebas/` | Catálogo de suites, registro de ejecuciones y cliente de GitHub Actions |
| `src/components/Pruebas/` | El tablero y los resultados |

## Problemas frecuentes

- **«Las pruebas todavía no están conectadas con GitHub»**: falta `GITHUB_PRUEBAS_TOKEN` en Render (o, fuera de Render, `GITHUB_PRUEBAS_REPOSITORIO`).
- **«GitHub rechazó el token»**: venció o no tiene *Actions: Read and write* sobre ese repositorio.
- **«GitHub no encontró pruebas-e2e.yml»**: el workflow no está en la rama que despliega Render, o el token es de otro repositorio.
- **«GitHub no inició la ejecución»**: revise que Actions esté habilitado en el repositorio (*Settings* → *Actions*).
- **La ejecución terminó sin resultados**: abra «Ver en GitHub» y revise el paso «Ejecutar las pruebas» (por ejemplo, la aplicación no levantó).
