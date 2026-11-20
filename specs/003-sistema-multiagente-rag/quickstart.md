# Quickstart previsto — Feature 003

**Estado**: no ejecutable todavía. La implementación está bloqueada hasta que el equipo apruebe la enmienda constitucional y revise spec, plan y tareas. Los comandos existentes verifican el Analista; los comandos de ingesta son los previstos para la fase aprobada y no se ejecutaron en esta tarea.

## Requisitos existentes

- Windows 10/11 y PowerShell 5.1 o 7.
- Python local del backend actual; consultar `agentes/analista/README.md` y confirmar versión de Render antes de fijarla para esta feature.
- Node/npm usados por el frontend actual.
- OpenCode Server en `127.0.0.1:4096` para pruebas manuales del Analista existente. Las pruebas del nuevo grafo deben usar mocks y no llamar OpenCode.
- Pinecone SDK Python compatible con document indexes/integrated embeddings (mínimo documentado `10.1.0` para `multilingual-e5-large`) se añadirá y fijará en el lock solo tras aprobar gobernanza.

## Preparación y pruebas existentes

Desde la raíz del repositorio, si el entorno local ya está creado:

```powershell
& .\agentes\analista\.venv\Scripts\python.exe -m pytest .\agentes\analista\tests -q
```

Ese comando solo verifica las pruebas existentes del Analista. No acredita la feature 003.

## Variables previstas (no contienen credenciales)

Después del gate, `.env.example` incluirá configuración pública como:

```dotenv
PINECONE_API_KEY=
PINECONE_INDEX_NAME=historias-usuario
PINECONE_CLOUD=aws
PINECONE_REGION=us-east-1
PINECONE_DIMENSION=1024
PINECONE_METRIC=cosine
PINECONE_EMBEDDING_MODEL=multilingual-e5-large
```

En `render.yaml`, la clave se declarará con `sync: false`; el archivo solo contendrá la configuración no secreta. La clave real se proporciona por el entorno del servicio ya existente. No se agrega un servicio Render.

## Ingesta prevista (requiere Pinecone configurado)

Después de implementar el paquete y configurar la credencial por el entorno:

```powershell
& .\agentes\analista\.venv\Scripts\python.exe -m agentes.conocimiento.ingesta --fuente todas
```

La ejecución crea/valida el índice configurado e ingiere las fuentes allowlisted en los seis namespaces. Este comando sí contacta Pinecone; no forma parte de pytest y no se ejecutó durante la preparación documental.

Las pruebas automatizadas posteriores usarán únicamente mocks del SDK, incluidos índice, upsert, búsqueda y fallos. No requieren `PINECONE_API_KEY` y no hacen llamadas a Pinecone real.

Cuando la enmienda esté aprobada y la implementación exista, este quickstart deberá actualizarse en la misma PR con:

1. versión Python de Render comprobada y comandos de instalación PowerShell;
2. dependencias LangGraph y Pinecone directas, lock reproducible y configuración sin secretos;
3. arranque de OpenCode, FastAPI y frontend en puertos/rutas vigentes;
4. comandos pytest para pruebas del grafo y mocks;
5. procedimiento local para responder a interrupciones y verificar pérdida de checkpoint al reiniciar;
6. health checks, apagado y troubleshooting.

No copiar valores de `.env` a esta guía. No crear un servicio Render nuevo ni un checkpointer persistente como parte de esta feature.
