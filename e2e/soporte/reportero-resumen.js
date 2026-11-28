// Reportero propio: escribe resumen.json, lo que lee el tablero «Pruebas automatizadas».
// Los demás reportes (HTML, JUnit, JSON completo, capturas y trazas) los genera Playwright y quedan como
// evidencias en GitHub. El backend valida este archivo (agentes/pruebas/pruebas_service.py, ResumenEjecucion).
import fs from 'node:fs';
import path from 'node:path';

const ANSI = /\u001b\[[0-9;]*m/g;
const ESTADO = Object.freeze({ expected: 'aprobado', unexpected: 'fallido', flaky: 'inestable', skipped: 'omitido' });

const limpiar = (texto, maximo) => (texto ? String(texto).replace(ANSI, '').trim().slice(0, maximo) : null);

export default class ReporteroResumen {
  constructor({ archivo = 'reportes/resumen.json' } = {}) {
    this.archivo = archivo;
    this.porCaso = new Map();
    this.inicio = new Date();
  }

  onBegin(config) {
    this.navegador = config.projects[0]?.use?.browserName ?? 'chromium';
  }

  onTestEnd(test, result) {
    // Con reintentos se llama una vez por intento: queda el último.
    const lista = test.titlePath().filter(Boolean);
    const etiqueta = (test.tags ?? []).find((tag) => tag !== '@basicas') ?? (test.tags ?? [])[0] ?? '';
    this.porCaso.set(test.id, {
      id: test.id,
      titulo: test.title,
      modulo: etiqueta.replace(/^@/, ''),
      archivo: path.basename(test.location.file),
      dispositivo: lista[0] ?? '',
      estado: ESTADO[test.outcome()] ?? 'fallido',
      duracion_ms: Math.max(0, Math.round(result.duration)),
      error: limpiar(result.error?.message, 1500),
      pasos: (result.steps ?? []).filter((paso) => paso.category === 'test.step').map((paso) => limpiar(paso.title, 200)),
    });
  }

  onEnd(result) {
    const listaCaso = [...this.porCaso.values()];
    const cuenta = (estado) => listaCaso.filter((caso) => caso.estado === estado).length;
    const resumen = {
      version: 1,
      inicio: this.inicio.toISOString(),
      duracion_ms: Math.max(0, Math.round(result.duration)),
      navegador: this.navegador,
      total: listaCaso.length,
      aprobados: cuenta('aprobado'),
      fallidos: cuenta('fallido'),
      inestables: cuenta('inestable'),
      omitidos: cuenta('omitido'),
      // Primero los fallidos: es lo que la persona quiere ver.
      casos: listaCaso.sort((a, b) => Number(b.estado === 'fallido') - Number(a.estado === 'fallido')),
    };
    fs.mkdirSync(path.dirname(this.archivo), { recursive: true });
    fs.writeFileSync(this.archivo, JSON.stringify(resumen, null, 2));
  }

  printsToStdio() {
    return false;
  }
}
