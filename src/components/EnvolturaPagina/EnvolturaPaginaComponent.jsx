import React, { useState } from 'react';
import { NavLink, Outlet } from 'react-router-dom';
import { Sparkles, Moon, Sun, UserRound } from 'lucide-react';
import { useTema } from '../../hooks/useTema';
import { useUsuarioActual } from '../../hooks/useUsuarioActual';
import { DialogoUsuarioComponent } from '../Usuario/DialogoUsuarioComponent';
import { TEXTO_PIE } from '../../config/entorno';
import { listaOpcionMenu } from '../../config/rutas';
import { AsistenteAyudaComponent } from '../AsistenteAyuda/AsistenteAyudaComponent';

export const EnvolturaPaginaComponent = () => {
  const { theme, toggleTheme } = useTema();
  const isDark = theme === 'dark';
  const { nombre, guardar } = useUsuarioActual();
  const [mostrarUsuario, setMostrarUsuario] = useState(false);

  return (
    <div className="app-container">
      <header className="header">
        <div className="header__inner">
          <NavLink to="/" className="header__brand" aria-label="Historias de Usuario, ir al inicio">
            <div className="brand-icon">
              <Sparkles size={20} />
            </div>
            <div className="brand-text">
              Historias de Usuario
            </div>
          </NavLink>

          {/* Las opciones salen del registro único de pantallas (src/config/rutas.jsx). */}
          <nav className="header__nav">
            {listaOpcionMenu().map(({ destino, etiqueta, titulo, icono: Icono, exacta }) => (
              <NavLink
                key={destino}
                to={destino}
                title={titulo}
                end={Boolean(exacta)}
                className={({ isActive }) => `header__nav-link ${isActive ? 'active' : ''}`}
              >
                <Icono size={18} />
                <span>{etiqueta}</span>
              </NavLink>
            ))}
          </nav>

          <button
            type="button"
            className="header__theme-toggle header__user"
            onClick={() => setMostrarUsuario(true)}
            aria-label={nombre ? `Usuario: ${nombre}. Cambiar nombre` : 'Identificarse'}
            title="Su nombre queda registrado en las historias que cree o modifique"
          >
            <UserRound size={18} />
            <span>{nombre || 'Identificarse'}</span>
          </button>

          <button
            type="button"
            className="header__theme-toggle"
            onClick={toggleTheme}
            aria-label={isDark ? 'Cambiar a modo claro' : 'Cambiar a modo oscuro'}
            title={isDark ? 'Cambiar a modo claro' : 'Cambiar a modo oscuro'}
          >
            {isDark ? <Sun size={18} /> : <Moon size={18} />}
            <span>{isDark ? 'Modo claro' : 'Modo oscuro'}</span>
          </button>
        </div>
      </header>

      {mostrarUsuario && (
        <DialogoUsuarioComponent
          nombreActual={nombre}
          alGuardar={(valor) => {
            guardar(valor);
            setMostrarUsuario(false);
          }}
          alCerrar={() => setMostrarUsuario(false)}
        />
      )}

      <main className="main-content">
        <Outlet />
      </main>

      <AsistenteAyudaComponent />

      <footer className="footer">
        <div className="footer__inner">
          <div>{TEXTO_PIE}</div>
        </div>
      </footer>
    </div>
  );
};
