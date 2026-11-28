# Imagen de las pruebas de punta a punta: Playwright con Chromium, Firefox y WebKit ya instalados.
# Corre contra la aplicación del servicio «app» de docker-compose.yml (o contra BASE_URL).
# La versión de la imagen debe ser la misma de @playwright/test en package-lock.json (lo revisa una prueba
# de estructura): si se actualiza Playwright, se cambia aquí también.
FROM mcr.microsoft.com/playwright:v1.65.1-noble

WORKDIR /pruebas
ENV CI=1 REPORTE_DIR=/pruebas/reportes
# Solo la dependencia de las pruebas: no hace falta instalar la interfaz completa.
RUN npm init -y >/dev/null \
    && npm pkg set type=module \
    && npm install --no-audit --no-fund --save-exact @playwright/test@1.65.1
COPY playwright.config.js ./
COPY src/config/acciones.js ./src/config/acciones.js
COPY e2e ./e2e

ENTRYPOINT ["npx", "playwright", "test"]
