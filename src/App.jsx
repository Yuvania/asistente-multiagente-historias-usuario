import React from 'react';
import { BrowserRouter as Router, Routes, Route } from 'react-router-dom';
import { EnvolturaPaginaComponent } from './components/EnvolturaPagina/EnvolturaPaginaComponent';
import { listaRuta } from './config/rutas';

// Las rutas salen del registro único (src/config/rutas.jsx): aquí no se agregan pantallas.
export function App() {
  return (
    <Router>
      <Routes>
        <Route path="/" element={<EnvolturaPaginaComponent />}>
          {listaRuta.map(({ ruta, componente: Componente }) => (ruta
            ? <Route key={ruta} path={ruta} element={<Componente />} />
            : <Route key="inicio" index element={<Componente />} />))}
        </Route>
      </Routes>
    </Router>
  );
}

export default App;
