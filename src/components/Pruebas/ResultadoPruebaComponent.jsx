import React, { useState } from 'react';
import { Link, useNavigate, useParams } from 'react-router-dom';
import { ArrowLeft, CheckCircle2, ExternalLink, MinusCircle, RotateCcw, AlertTriangle, XCircle } from 'lucide-react';
import { TituloPaginaComponent } from '../Comun/TituloPaginaComponent';
import { BotonComponent } from '../Comun/BotonComponent';
import { AlertaComponent } from '../Comun/AlertaComponent';
import { Permitido } from '../Sesion/SesionContext';
import { ACCION } from '../../config/acciones';
import { useEjecucionPrueba } from '../../hooks/usePruebas';
import { pruebasApi } from '../../services/pruebasApi';
import { ESTADO_CASO, casosAprobados, duracion, estaActiva, numeroEjecucion } from '../../utils/formatoPruebas';
import { EstadoEjecucion, LineaTiempo } from './PruebasComponent';

const ICONO_CASO = Object.freeze({ aprobado: CheckCircle2, fallido: XCircle, inestable: AlertTriangle, omitido: MinusCircle });
const LISTA_FILTRO = Object.freeze([
  { id: 'todos', texto: 'Todos', incluye: () => true },
  { id: 'fallidos', texto: 'Fallidos', incluye: (caso) => caso.estado === 'fallido' },
  { id: 'aprobados', texto: 'Aprobados', incluye: (caso) => caso.estado === 'aprobado' || caso.estado === 'inestable' },
]);
const DISPOSITIVO = Object.freeze({ web: 'web', tablet: 'tablet', movil: 'móvil' });

const Caso = ({ caso }) => {
  const estado = ESTADO_CASO[caso.estado] ?? ESTADO_CASO.fallido;
  const Icono = ICONO_CASO[caso.estado] ?? XCircle;
  return (
    <li className="pruebas__caso">
      <span className={`pruebas__icono pruebas__icono--${estado.clase}`} aria-hidden="true"><Icono size={16} /></span>
      <div className="pruebas__caso-texto">
        <p className="pruebas__caso-titulo">
          {caso.titulo}
          <span className="sr-only"> — {estado.texto}</span>
        </p>
        {caso.error && <p className="pruebas__caso-error">{caso.error.split('\n')[0]}</p>}
        <p className="pruebas__meta">
          {[caso.modulo, DISPOSITIVO[caso.dispositivo] ?? caso.dispositivo, duracion(caso.duracion_ms)].filter(Boolean).join(' · ')}
          {caso.estado === 'inestable' ? ' · pasó al reintentar' : ''}
        </p>
        {(caso.pasos?.length > 0 || caso.error) && (
          <details className="pruebas__detalle">
            <summary>Ver pasos{caso.error ? ' y error completo' : ''}</summary>
            {caso.pasos?.length > 0 && (
              <ol className="pruebas__pasos">{caso.pasos.map((paso, indice) => <li key={`${indice}-${paso}`}>{paso}</li>)}</ol>
            )}
            {caso.error && <pre className="pruebas__error-completo">{caso.error}</pre>}
          </details>
        )}
      </div>
    </li>
  );
};

export const ResultadoPruebaComponent = () => {
  const { id } = useParams();
  const navigate = useNavigate();
  const { ejecucion, error } = useEjecucionPrueba(id);
  const [filtro, setFiltro] = useState('todos');
  const [repitiendo, setRepitiendo] = useState(false);
  const [errorRepetir, setErrorRepetir] = useState('');

  if (!ejecucion) {
    return (
      <div className="pruebas">
        <TituloPaginaComponent title="Resultados de la ejecución" />
        {error ? <AlertaComponent type="warning" title="No se pudo abrir">{error}</AlertaComponent> : <p className="pruebas__vacio">Consultando…</p>}
        <Link className="btn btn--outline btn--sm" to="/pruebas"><ArrowLeft size={14} aria-hidden="true" /> Volver a Pruebas</Link>
      </div>
    );
  }

  const resumen = ejecucion.resumen;
  const listaCaso = ejecucion.casos ?? [];
  const fallidos = listaCaso.filter((caso) => caso.estado === 'fallido').length;
  const elegido = LISTA_FILTRO.find((item) => item.id === filtro) ?? LISTA_FILTRO[0];

  const repetir = async () => {
    setRepitiendo(true);
    setErrorRepetir('');
    try {
      await pruebasApi.repetirFallidos(ejecucion.id);
      navigate('/pruebas');
    } catch (fallo) {
      console.warn('No se pudieron repetir los fallidos:', fallo?.message ?? fallo);
      setErrorRepetir(fallo?.message || 'No se pudieron repetir los casos fallidos.');
    } finally {
      setRepitiendo(false);
    }
  };

  return (
    <div className="pruebas">
      <TituloPaginaComponent
        title={`Ejecución ${numeroEjecucion(ejecucion.numero)} · ${ejecucion.alcance_nombre}`}
        description={[
          resumen ? `${casosAprobados(resumen)} casos` : null,
          resumen ? duracion(resumen.duracion_ms) : null,
          ejecucion.navegador_nombre, `ambiente ${ejecucion.ambiente_nombre}`, ejecucion.iniciada_por,
        ].filter(Boolean).join(' · ')}
        action={<EstadoEjecucion estado={ejecucion.estado} />}
      />

      <div className="pruebas__acciones">
        <Link className="btn btn--outline btn--sm" to="/pruebas"><ArrowLeft size={14} aria-hidden="true" /> Volver a Pruebas</Link>
        {ejecucion.run_url && (
          <a className="btn btn--secondary btn--sm" href={ejecucion.run_url} target="_blank" rel="noreferrer">
            <ExternalLink size={14} aria-hidden="true" /> Evidencias en GitHub
          </a>
        )}
        {fallidos > 0 && (
          <Permitido accion={ACCION.PRUEBA_EJECUTAR}>
            <BotonComponent variant="primary" size="sm" icon={RotateCcw} onClick={repetir} disabled={repitiendo}>
              {repitiendo ? 'Iniciando…' : 'Volver a ejecutar los fallidos'}
            </BotonComponent>
          </Permitido>
        )}
      </div>
      {errorRepetir && <AlertaComponent type="warning" title="No se pudo iniciar">{errorRepetir}</AlertaComponent>}
      {ejecucion.mensaje && !estaActiva(ejecucion) && ejecucion.estado !== 'aprobada' && (
        <AlertaComponent type="info" title="Detalle">{ejecucion.mensaje}</AlertaComponent>
      )}

      {estaActiva(ejecucion) && (
        <section className="pruebas__tarjeta" aria-label="Avance">
          <LineaTiempo pasos={ejecucion.pasos} />
        </section>
      )}

      <section className="pruebas__tarjeta" aria-labelledby="prueba-casos">
        <div className="pruebas__encabezado">
          <h2 id="prueba-casos" className="pruebas__subtitulo">Casos de prueba</h2>
          <div className="pruebas__filtros" role="group" aria-label="Filtrar casos">
            {LISTA_FILTRO.map((item) => (
              <button key={item.id} type="button" aria-pressed={filtro === item.id}
                className={`pruebas__filtro ${filtro === item.id ? 'pruebas__filtro--activo' : ''}`} onClick={() => setFiltro(item.id)}>
                {item.texto} <span className="pruebas__cuenta">{listaCaso.filter(item.incluye).length}</span>
              </button>
            ))}
          </div>
        </div>
        {listaCaso.length === 0 ? (
          <p className="pruebas__vacio">{estaActiva(ejecucion) ? 'Los casos aparecen cuando termina la ejecución.' : 'Esta ejecución no tiene casos.'}</p>
        ) : (
          <ul className="pruebas__casos" aria-label="Casos">
            {listaCaso.filter(elegido.incluye).map((caso) => <Caso key={caso.id || `${caso.titulo}-${caso.dispositivo}`} caso={caso} />)}
          </ul>
        )}
      </section>

      <p className="pruebas__nota">
        En GitHub, el artefacto «evidencias» trae el reporte HTML de Playwright, el JUnit y, de cada caso fallido, la captura, el video y
        la traza (se abre en trace.playwright.dev).
      </p>
    </div>
  );
};
