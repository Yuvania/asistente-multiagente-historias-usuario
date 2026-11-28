import { useCallback, useEffect, useRef, useState } from 'react';
import { pruebasApi } from '../services/pruebasApi';
import { estaActiva } from '../utils/formatoPruebas';

// Mientras una ejecución corre, el tablero pregunta cada pocos segundos (el backend consulta a GitHub).
export const CADA_CONSULTA_MS = 5000;
const PANEL_VACIO = Object.freeze({ indicador: { ultima: null, tasa_exito: null }, activa: null, lista_ejecucion: [] });

const mensajeDe = (error, porDefecto) => error?.message || porDefecto;

/** Configuración y ejecuciones del tablero «Pruebas automatizadas». */
export const usePruebas = () => {
  const [configuracion, setConfiguracion] = useState(null);
  const [panel, setPanel] = useState(PANEL_VACIO);
  const [cargando, setCargando] = useState(true);
  const [error, setError] = useState('');
  const [enviando, setEnviando] = useState(false);
  const montado = useRef(true);

  const cargarPanel = useCallback(async () => {
    try {
      const respuesta = await pruebasApi.listar();
      if (montado.current) setPanel(respuesta ?? PANEL_VACIO);
    } catch (fallo) {
      console.warn('No se pudieron consultar las ejecuciones:', fallo?.message ?? fallo);
      if (montado.current) setError(mensajeDe(fallo, 'No se pudieron consultar las ejecuciones.'));
    } finally {
      if (montado.current) setCargando(false);
    }
  }, []);

  useEffect(() => {
    montado.current = true;
    pruebasApi.leerConfiguracion().then((respuesta) => { if (montado.current) setConfiguracion(respuesta); }).catch((fallo) => {
      console.warn('No se pudo leer la configuración de pruebas:', fallo?.message ?? fallo);
      if (montado.current) setError(mensajeDe(fallo, 'No se pudo leer la configuración de las pruebas.'));
    });
    cargarPanel();
    return () => { montado.current = false; };
  }, [cargarPanel]);

  const hayActiva = estaActiva(panel.activa);
  useEffect(() => {
    if (!hayActiva) return undefined;
    const intervalo = window.setInterval(cargarPanel, CADA_CONSULTA_MS);
    return () => window.clearInterval(intervalo);
  }, [hayActiva, cargarPanel]);

  const ejecutar = useCallback(async (datos) => {
    setEnviando(true);
    setError('');
    try {
      await pruebasApi.ejecutar(datos);
      await cargarPanel();
      return true;
    } catch (fallo) {
      console.warn('No se pudo iniciar la ejecución:', fallo?.message ?? fallo);
      setError(mensajeDe(fallo, 'No se pudo iniciar la ejecución.'));
      return false;
    } finally {
      setEnviando(false);
    }
  }, [cargarPanel]);

  const cancelar = useCallback(async (id) => {
    setError('');
    try {
      await pruebasApi.cancelar(id);
    } catch (fallo) {
      console.warn('No se pudo cancelar la ejecución:', fallo?.message ?? fallo);
      setError(mensajeDe(fallo, 'No se pudo cancelar la ejecución.'));
    }
    await cargarPanel();
  }, [cargarPanel]);

  return { configuracion, panel, cargando, error, enviando, ejecutar, cancelar, recargar: cargarPanel };
};

/** Una ejecución con todos sus casos. Se actualiza sola mientras corre. */
export const useEjecucionPrueba = (id) => {
  const [ejecucion, setEjecucion] = useState(null);
  const [error, setError] = useState('');

  const cargar = useCallback(async () => {
    try {
      setEjecucion(await pruebasApi.obtener(id));
      setError('');
    } catch (fallo) {
      console.warn('No se pudo consultar la ejecución:', fallo?.message ?? fallo);
      setError(mensajeDe(fallo, 'No se pudo consultar la ejecución.'));
    }
  }, [id]);

  useEffect(() => { cargar(); }, [cargar]);

  const activa = estaActiva(ejecucion);
  useEffect(() => {
    if (!activa) return undefined;
    const intervalo = window.setInterval(cargar, CADA_CONSULTA_MS);
    return () => window.clearInterval(intervalo);
  }, [activa, cargar]);

  return { ejecucion, error, recargar: cargar };
};
