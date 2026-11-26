// Registro único de pantallas: de aquí salen las rutas de la aplicación y las opciones del menú.
// Agregar una pantalla = agregar una entrada. Si debe verse en el menú, se le pone «menu».
// Ver docs/arquitectura.md y la skill «agregar-ruta».
import { LayoutDashboard, FileText, PlusCircle, HelpCircle } from 'lucide-react';
import { TableroComponent } from '../components/Dashboard/TableroComponent';
import { ListaHistoriaUsuarioComponent } from '../components/HistoriaUsuario/ListaHistoriaUsuarioComponent';
import { CrearHistoriaUsuarioComponent } from '../components/HistoriaUsuario/CrearHistoriaUsuarioComponent';
import { DetalleHistoriaUsuarioComponent } from '../components/HistoriaUsuario/DetalleHistoriaUsuarioComponent';
import { SolicitarCambioHistoriaComponent } from '../components/HistoriaUsuario/SolicitarCambioHistoriaComponent';
import { EditarHistoriaUsuarioComponent } from '../components/HistoriaUsuario/EditarHistoriaUsuarioComponent';
import { ListaHabilidadComponent } from '../components/Habilidad/ListaHabilidadComponent';
import { AyudaComponent } from '../components/Ayuda/AyudaComponent';
import { ListaLeccionComponent } from '../components/Leccion/ListaLeccionComponent';

// ruta: relativa a la raíz ('' es el inicio). componente: lo que se muestra.
// menu (opcional): etiqueta, título (texto emergente), ícono, orden y si la ruta debe coincidir exacta.
export const listaRuta = Object.freeze([
  {
    ruta: '',
    componente: TableroComponent,
    menu: { etiqueta: 'Dashboard', titulo: 'Ir al Dashboard', icono: LayoutDashboard, orden: 10, exacta: true },
  },
  {
    ruta: 'historias',
    componente: ListaHistoriaUsuarioComponent,
    menu: { etiqueta: 'Historias de Usuario', titulo: 'Ver Historias de Usuario', icono: FileText, orden: 20, exacta: true },
  },
  {
    ruta: 'historias/nueva',
    componente: CrearHistoriaUsuarioComponent,
    menu: { etiqueta: 'Nueva Historia', titulo: 'Crear Nueva Historia', icono: PlusCircle, orden: 30 },
  },
  { ruta: 'historias/:id', componente: DetalleHistoriaUsuarioComponent },
  { ruta: 'historias/:id/editar', componente: EditarHistoriaUsuarioComponent },
  { ruta: 'historias/:id/solicitar-cambio', componente: SolicitarCambioHistoriaComponent },
  { ruta: 'lecciones', componente: ListaLeccionComponent },
  { ruta: 'skills', componente: ListaHabilidadComponent },
  {
    ruta: 'ayuda',
    componente: AyudaComponent,
    menu: { etiqueta: 'Ayuda', titulo: 'Ver Ayuda', icono: HelpCircle, orden: 90 },
  },
]);

// Opciones del menú principal, en su orden.
export const listaOpcionMenu = () => listaRuta
  .filter((entrada) => entrada.menu)
  .map((entrada) => ({ ...entrada.menu, destino: `/${entrada.ruta}` }))
  .sort((a, b) => a.orden - b.orden);
