import React, { useEffect, useRef, useState } from 'react';
import { Sparkles, LogIn } from 'lucide-react';
import { CampoTextoComponent } from '../Comun/CampoTextoComponent';
import { BotonComponent } from '../Comun/BotonComponent';
import { AlertaComponent } from '../Comun/AlertaComponent';
import { useSesion } from './SesionContext';

/** Ingreso con usuario y contraseña propios: lo que haga la persona queda a su nombre. */
export const InicioSesionComponent = () => {
  const { entrar, error: errorSesion } = useSesion();
  const [usuario, setUsuario] = useState('');
  const [clave, setClave] = useState('');
  const [error, setError] = useState('');
  const [enviando, setEnviando] = useState(false);
  const campoRef = useRef(null);

  useEffect(() => {
    campoRef.current?.focus();
  }, []);

  const enviar = async (evento) => {
    evento.preventDefault();
    if (!usuario.trim() || !clave) {
      setError('Escriba su usuario y su contraseña.');
      return;
    }
    setEnviando(true);
    setError('');
    try {
      await entrar(usuario.trim(), clave);
    } catch (fallo) {
      console.error('No se pudo iniciar sesión:', fallo);
      setError(fallo?.status === 401 ? 'Usuario o contraseña incorrectos.' : 'No hay conexión con el servicio. Inténtelo de nuevo.');
      setEnviando(false);
    }
  };

  return (
    <div className="inicio-sesion">
      <form className="card inicio-sesion__tarjeta" onSubmit={enviar} aria-label="Iniciar sesión">
        <div className="inicio-sesion__marca">
          <div className="brand-icon"><Sparkles size={20} /></div>
          <h1>Historias de Usuario</h1>
        </div>
        <p className="form-hint">Ingrese con su usuario. Las historias que cree, apruebe o devuelva quedan a su nombre.</p>
        {(error || errorSesion) && <AlertaComponent type="warning" title="No se pudo ingresar">{error || errorSesion}</AlertaComponent>}
        <CampoTextoComponent
          label="Usuario"
          id="sesion-usuario"
          ref={campoRef}
          autoComplete="username"
          value={usuario}
          maxLength={60}
          onChange={(evento) => setUsuario(evento.target.value)}
        />
        <CampoTextoComponent
          label="Contraseña"
          id="sesion-clave"
          type="password"
          autoComplete="current-password"
          value={clave}
          maxLength={200}
          onChange={(evento) => setClave(evento.target.value)}
        />
        <BotonComponent type="submit" variant="primary" icon={LogIn} disabled={enviando} className="inicio-sesion__boton">
          {enviando ? 'Ingresando…' : 'Ingresar'}
        </BotonComponent>
      </form>
    </div>
  );
};
