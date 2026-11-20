# Guía de pruebas y arranque en PowerShell

Esta guía valida la aplicación y el despliegue actual sin cambiar secretos, crear servicios Render ni modificar el esquema TiDB. En esta revisión solo está integrado el Agente Analista; los casos de feature 003 que requieren Redactor-Revisor, Asesor Técnico, Gestor de Cambios, LangGraph o Pinecone no pueden considerarse aprobados.

## Requisitos

- Node.js 22 y npm.
- Python 3.12 para el backend local.
- Docker Desktop con el motor Linux iniciado para construir la imagen.
- El `.env` local ya configurado. No copies valores de credenciales a logs, capturas o tickets.

## Arranque local

Desde la raíz del repositorio:

```powershell
npm ci
py -3.12 -m venv agentes\analista\.venv
& .\agentes\analista\.venv\Scripts\python.exe -m pip install -r .\agentes\analista\requirements.txt
```

Si falta `.env`, copia la plantilla y completa las variables localmente; el archivo no se debe subir a Git:

```powershell
if (-not (Test-Path .\.env)) { Copy-Item .\agentes\analista\.env.example .\.env }
notepad .\.env
```

Inicia OpenCode, FastAPI y React con el script existente:

```powershell
npm run iniciar
```

El script local usa los puertos 4096 (OpenCode), 8000 (FastAPI) y 3000 (Vite). FastAPI se inicia con un worker. Para detener los procesos:

```powershell
npm run detener
```

## Comprobaciones HTTP

La comprobación ligera usada por Render no lleva credenciales. En Render, `dist` siempre forma parte de la imagen y `/healthz` está registrado. En local se registra solo si existe `dist`; ejecuta primero `npm run build` si quieres probar esa ruta:

```powershell
Invoke-RestMethod -Uri 'http://127.0.0.1:8000/healthz'
```

El diagnóstico del Analista requiere autenticación cuando `ANALISTA_PUBLICO=1`:

```powershell
$credenciales = Get-Credential
Invoke-RestMethod -Uri 'http://127.0.0.1:8000/api/analista/health' -Credential $credenciales | ConvertTo-Json -Depth 8
```

El segundo endpoint informa la salud del Analista, OpenCode y MCP. No comprueba los otros tres agentes ni Pinecone.

## Pruebas y build

```powershell
npm test
npm run build
& .\agentes\analista\.venv\Scripts\python.exe -m pytest agentes\analista -q
```

Los tests del Analista usan dobles para proveedores y servicios externos. Un resultado verde verifica las pruebas locales existentes; no demuestra acceso a OpenCode, TiDB o Pinecone en Render.

## Construcción Docker

Verifica que Docker Desktop tenga iniciado el motor Linux antes de ejecutar:

```powershell
docker version
docker build -t historias-multiagente .
```

El Dockerfile construye la interfaz y empaqueta React, FastAPI y OpenCode en una imagen. El comando no despliega la imagen ni crea recursos en Render.

Para inspeccionar memoria de contenedores locales que ya estén ejecutándose:

```powershell
docker stats
```

`docker build` solo construye la imagen; no crea ni inicia un contenedor. Para el servicio publicado, usa las métricas del panel de Render. No se puede leer la memoria remota con estos comandos locales.

## Invariantes del despliegue

- Un Web Service Docker en Render; sin workers extra ni servicios nuevos.
- React, FastAPI y OpenCode dentro de la imagen existente.
- `DATABASE_URL` mantiene la conexión TiDB actual. No apliques scripts destructivos ni borres tablas como parte de esta validación.
- Se mantienen `ANALISTA_PUBLICO`, `ACCESO_USUARIO`, `ACCESO_CLAVE`, `OPENCODE_SERVER_PASSWORD` y `OPENCODE_API_KEY`; no imprimas ni cambies sus valores.
- Render consulta `/healthz`; la ruta está exenta de Basic Auth.
- El entrypoint actual inicia Uvicorn con `--workers 1`.
- `PINECONE_API_KEY` y `INGESTA_AL_ARRANCAR` no están implementadas en el servicio. No las agregues ni actives hasta que exista una ingesta controlada, con fuentes permitidas y pruebas de degradación.

## Estado de validación de feature 003

| Comprobación | Estado en esta revisión |
|---|---|
| Analista original | Validable con las pruebas frontend y Python existentes. |
| Redactor-Revisor y HU generada editable | No implementado. |
| Asesor Técnico y citas de archivos ficticios | No implementado; no se encontró el repositorio Python ficticio de la feature. |
| Gestor de Cambios y clasificación | No implementado como agente. |
| Cuatro agentes cargados en OpenCode | No: `opencode.jsonc` declara solo `analista`. |
| Grafos e interrupciones humanas LangGraph | No implementados. |
| Pinecone e ingesta de fuentes autorizadas | No implementados ni configurados. |
| Aprobación humana | El paso humano existente del Analista se conserva; no existe el flujo de aprobación LangGraph. |
| Render/Docker | Dockerfile y Blueprint conservan un servicio. La construcción debe confirmarse con Docker Desktop activo. |

Una validación completa de feature 003 requiere implementar esos componentes y añadir pruebas específicas. No declares la feature lista ni despliegues basándote únicamente en los tests del Analista.
