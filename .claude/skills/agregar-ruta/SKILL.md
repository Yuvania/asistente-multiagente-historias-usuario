---
name: agregar-ruta
description: Úsala cuando haya que agregar una pantalla, una ruta o una opción de menú al frontend React de este repositorio de historias de usuario.
---

# Agregar una pantalla o una opción de menú

Las rutas y el menú salen de un solo registro: `src/config/rutas.jsx`. No agregues `<Route>` en `App.jsx` ni enlaces en `EnvolturaPaginaComponent.jsx`.

## Pasos
1. Crea el componente en `src/components/<Funcionalidad>/<Nombre>Component.jsx`.
   - Lógica sin React en `src/utils/` (con pruebas), llamadas al backend en `src/services/`, estado reutilizable en `src/hooks/`.
   - Componentes comunes (botones, alertas, tarjetas, áreas de texto) en `src/components/Comun/`: reutilízalos.
2. Agrega una entrada en `listaRuta` de `src/config/rutas.jsx`:
   ```js
   { ruta: 'reportes', componente: ReporteComponent,
     menu: { etiqueta: 'Reportes', titulo: 'Ver reportes', icono: BarChart3, orden: 40 } },
   ```
   - Sin `menu` la pantalla existe pero no aparece en el menú (por ejemplo, un detalle `historias/:id`).
   - `orden` en decenas y único; `exacta: true` si la ruta no debe marcarse activa en sus subrutas.
   - Íconos de `lucide-react`.
3. Si la pantalla es nueva para la persona usuaria, descríbela en la Ayuda (`src/data/ayudaDocumentacion.js`).
4. Prueba con Testing Library (mira `src/components/EnvolturaPagina/__tests__/`) y ejecuta `npx vitest run` y `npx vite build`.

## Convenciones
- Componentes terminan en `Component`; servicios en `Service`.
- Nombres en español y en singular para variables (`listaHistoria`).
- Sin `catch` vacío: al menos `console.warn` con el motivo.
- Textos para la persona usuaria en lenguaje de negocio, sin detalle técnico.
