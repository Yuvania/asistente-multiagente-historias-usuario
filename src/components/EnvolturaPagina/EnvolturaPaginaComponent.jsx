import React, { useState } from 'react';
import { NavLink, Outlet } from 'react-router-dom';
import { Sparkles, Moon, Sun, UserRound, LogOut } from 'lucide-react';
import { useTema } from '../../hooks/useTema';
import { useUsuarioActual } from '../../hooks/useUsuarioActual';
import { DialogoUsuarioComponent } from '../Usuario/DialogoUsuarioComponent';
import { TEXTO_PIE } from '../../config/entorno';
import { listaOpcionMenu } from '../../config/rutas';
import { AsistenteAyudaComponent } from '../AsistenteAyuda/AsistenteAyudaComponent';
import { useSesion } from '../Sesion/SesionContext';
import { useConfirmacion } from '../Comun/ConfirmacionComponent';

export const EnvolturaPaginaComponent = () => {
  const { theme, toggleTheme } = useTema();
  const isDark = theme === 'dark';
  const { nombre, guardar } = useUsuarioActual();
  const [mostrarUsuario, setMostrarUsuario] = useState(false);
  const { seguridad, usuario, puede, salir } = useSesion();
  const confirmar = useConfirmacion();
  const cerrarSesion = async () => {
    if (await confirmar({ titulo: 'Cerrar sesión', mensaje: `¿Cerrar la sesión de ${usuario.nombre}?`, textoConfirmar: 'Cerrar sesión' })) salir();
  };

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
            {listaOpcionMenu(puede).map(({ destino, etiqueta, titulo, icono: Icono, exacta }) => (
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

          {seguridad && usuario ? (
            <button
              type="button"
              className="header__theme-toggle header__user"
              onClick={cerrarSesion}
              aria-label={`Usuario: ${usuario.nombre}. Cerrar sesión`}
              title={`${usuario.nombre} (${usuario.roles.map((rol) => rol.nombre).join(', ') || 'sin roles'}). Cerrar sesión`}
            >
              <LogOut size={18} />
              <span>{usuario.nombre}</span>
            </button>
          ) : (
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
          )}

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
