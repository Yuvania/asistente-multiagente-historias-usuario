import React from 'react';
import { render, screen, waitFor } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { MemoryRouter } from 'react-router-dom';
import { describe, expect, it, vi, beforeEach } from 'vitest';
import { PruebasComponent } from '../PruebasComponent';
import { pruebasApi } from '../../../services/pruebasApi';
import { casosAprobados, duracion, numeroEjecucion } from '../../../utils/formatoPruebas';

vi.mock('../../../services/pruebasApi', () => ({
  pruebasApi: {
    leerConfiguracion: vi.fn(), listar: vi.fn(), ejecutar: vi.fn(), obtener: vi.fn(), repetirFallidos: vi.fn(), cancelar: vi.fn(),
  },
}));

const CONFIGURACION = {
  configurado: true, faltante: [],
  lista_alcance: [
    { codigo: 'regresion', nombre: 'Todos los módulos (regresión)', descripcion: 'Todo.', permite_produccion: false },
    { codigo: 'basicas', nombre: 'Solo las básicas (smoke)', descripcion: 'Smoke.', permite_produccion: true },
  ],
  lista_ambiente: [{ codigo: 'pruebas', nombre: 'Pruebas' }, { codigo: 'produccion', nombre: 'Producción (solo lectura)' }],
  lista_navegador: [{ codigo: 'chromium', nombre: 'Chromium' }],
};

const abrir = () => render(<MemoryRouter><PruebasComponent /></MemoryRouter>);

describe('formato de las pruebas', () => {
  it('muestra números, duraciones y casos aprobados como en el tablero', () => {
    expect(numeroEjecucion(7)).toBe('#007');
    expect(duracion(272000)).toBe('04:32');
    expect(duracion(3725000)).toBe('1:02:05');
    expect(duracion(null)).toBe('—');
    expect(casosAprobados({ total: 9, aprobados: 6, inestables: 1 })).toBe('7 de 9');
  });
});

describe('tablero de pruebas automatizadas', () => {
  beforeEach(() => {
    vi.mocked(pruebasApi.leerConfiguracion).mockResolvedValue(CONFIGURACION);
    vi.mocked(pruebasApi.listar).mockResolvedValue({ indicador: { ultima: null, tasa_exito: null }, activa: null, lista_ejecucion: [] });
    vi.mocked(pruebasApi.ejecutar).mockResolvedValue({});
  });

  it('sin GitHub configurado lo explica y no deja ejecutar', async () => {
    vi.mocked(pruebasApi.leerConfiguracion).mockResolvedValue({ ...CONFIGURACION, configurado: false, faltante: ['GITHUB_PRUEBAS_TOKEN'] });
    abrir();
    expect(await screen.findByText(/Falta GITHUB_PRUEBAS_TOKEN/)).toBeInTheDocument();
    expect(screen.getByRole('button', { name: 'Ejecutar pruebas' })).toBeDisabled();
  });

  it('envía lo que se eligió y en producción solo ofrece las básicas', async () => {
    const usuario = userEvent.setup();
    abrir();
    await screen.findByRole('option', { name: 'Todos los módulos (regresión)' });
    await usuario.selectOptions(screen.getByLabelText('Ambiente'), 'produccion');
    expect(screen.getByLabelText('Qué probar')).toHaveValue('basicas');
    expect(screen.queryByRole('option', { name: 'Todos los módulos (regresión)' })).not.toBeInTheDocument();
    await usuario.click(screen.getByRole('button', { name: 'Ejecutar pruebas' }));
    await waitFor(() => expect(pruebasApi.ejecutar).toHaveBeenCalledWith({ alcance: 'basicas', ambiente: 'produccion', navegador: 'chromium' }));
  });
});
