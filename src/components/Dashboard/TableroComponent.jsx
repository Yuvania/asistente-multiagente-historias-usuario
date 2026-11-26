import React, { useState, useEffect } from 'react';
import { useNavigate } from 'react-router-dom';
import { TituloPaginaComponent } from '../Comun/TituloPaginaComponent';
import { EVENTO_SINCRONIZADO, getStoredStories } from '../../utils/storage';
import { PlusCircle, CheckCircle2, Clock, HelpCircle } from 'lucide-react';
import { TarjetaComponent } from '../Comun/TarjetaComponent';
import { UltimasHistoriasComponent } from './UltimasHistoriasComponent';

export const TableroComponent = () => {
  const navigate = useNavigate();
  const [stories, setStories] = useState([]);

  useEffect(() => {
    const refrescar = () => setStories(getStoredStories());
    refrescar();
    window.addEventListener(EVENTO_SINCRONIZADO, refrescar);
    return () => window.removeEventListener(EVENTO_SINCRONIZADO, refrescar);
  }, []);

  const reviewedCount = stories.filter(s => s.status === 'revisada' || s.status === 'aprobada').length;
  const inAnalysisCount = stories.filter(s => s.status === 'en_analisis' || s.status === 'borrador').length;
  const pendingCount = stories.filter(s => s.status === 'pendiente_de_informacion').length;

  return (
    <div>
      <TituloPaginaComponent
        title="Panel de Historias de Usuario"
        description="Seguimiento de las historias del equipo, de la minuta a la aprobación."
      />

      {/* Bienvenida sobria: superficie, borde fino y una sola acción principal (marca Ciruela corporativa). */}
      <section className="tablero-bienvenida" aria-labelledby="tablero-bienvenida-titulo">
        <div>
          <h2 id="tablero-bienvenida-titulo" className="tablero-bienvenida__titulo">
            Historias de usuario claras y aprobadas antes del desarrollo
          </h2>
          <p className="tablero-bienvenida__texto">
            Cree una historia a partir de una minuta o un requerimiento.
          </p>
        </div>
        <button type="button" className="btn btn--primary" onClick={() => navigate('/historias/nueva')}>
          <PlusCircle size={18} />
          Nueva historia
        </button>
      </section>

      <div className="grid-3">
        <TarjetaComponent title="Aprobadas">
          <div style={{ display: 'flex', alignItems: 'center', gap: '0.75rem', marginTop: '0.5rem' }}>
            <div style={{ width: '40px', height: '40px', borderRadius: '50%', backgroundColor: 'var(--color-success-light)', color: 'var(--color-success-text)', display: 'flex', alignItems: 'center', justifyContent: 'center' }}>
              <CheckCircle2 size={22} />
            </div>
            <span style={{ fontSize: '1.75rem', fontWeight: '600', letterSpacing: '-0.02em', color: 'var(--color-text-primary)' }}>{reviewedCount}</span>
          </div>
        </TarjetaComponent>

        <TarjetaComponent title="En análisis">
          <div style={{ display: 'flex', alignItems: 'center', gap: '0.75rem', marginTop: '0.5rem' }}>
            <div style={{ width: '40px', height: '40px', borderRadius: '50%', backgroundColor: 'var(--color-secondary-light)', color: 'var(--color-secondary-text)', display: 'flex', alignItems: 'center', justifyContent: 'center' }}>
              <Clock size={22} />
            </div>
            <span style={{ fontSize: '1.75rem', fontWeight: '600', letterSpacing: '-0.02em', color: 'var(--color-text-primary)' }}>{inAnalysisCount}</span>
          </div>
        </TarjetaComponent>

        <TarjetaComponent title="Pendientes de respuesta de Negocio">
          <div style={{ display: 'flex', alignItems: 'center', gap: '0.75rem', marginTop: '0.5rem' }}>
            <div style={{ width: '40px', height: '40px', borderRadius: '50%', backgroundColor: 'var(--color-warning-light)', color: 'var(--color-warning-text)', display: 'flex', alignItems: 'center', justifyContent: 'center' }}>
              <HelpCircle size={22} />
            </div>
            <span style={{ fontSize: '1.75rem', fontWeight: '600', letterSpacing: '-0.02em', color: 'var(--color-text-primary)' }}>{pendingCount}</span>
          </div>
        </TarjetaComponent>
      </div>

      <div style={{ marginTop: '1.5rem' }}>
        <UltimasHistoriasComponent stories={stories} onVer={(id) => navigate(`/historias/${id}`)} onVerTodas={() => navigate('/historias')} />
      </div>
    </div>
  );
};
