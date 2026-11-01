// Rutas de la app. Las zonas privadas tienen guarda: sin sesión van a
// /acces; con el rol equivocado, a su propia zona. La frontera de verdad es
// el API; esto solo evita pintar pantallas que no tocan.
import type { ReactNode } from 'react';
import { BrowserRouter, Link, Navigate, Route, Routes } from 'react-router';
import { Building2, ChartColumn, ClipboardList, ClipboardPlus, LayoutDashboard, PawPrint, Settings, UserRound } from 'lucide-react';
import { t } from './i18n/index.ts';
import { ProveedorSesion, useSesion, zonaDe } from './sesion.tsx';
import { Cargando } from './componentes/comunes.tsx';
import { Esqueleto } from './componentes/Esqueleto.tsx';
import { AvisoVersion } from './componentes/AvisoVersion.tsx';
import { Landing } from './pantallas/publico/Landing.tsx';
import { Acceso } from './pantallas/acceso/Acceso.tsx';
import { Establece, Privacidad, Recupera, VerificaCorreo } from './pantallas/acceso/Enlaces.tsx';
import { Perfil } from './pantallas/comun/Perfil.tsx';
import { PaginaNotificaciones } from './pantallas/comun/PaginaNotificaciones.tsx';
import { ListaCasos } from './pantallas/casos/ListaCasos.tsx';
import { FichaCaso } from './pantallas/casos/FichaCaso.tsx';
import { NovaDerivacion } from './pantallas/casos/NovaDerivacion.tsx';
import { FichaPaciente, ListaPacientes } from './pantallas/casos/Pacientes.tsx';
import { InformeVista } from './pantallas/casos/Informes.tsx';
import { Clinicas, InicioBambu } from './pantallas/bambu/Bambu.tsx';
import { Panel } from './pantallas/bambu/Panel.tsx';
import { Configuracion } from './pantallas/bambu/configuracion/Configuracion.tsx';

function Guarda({ zona, children }: { zona: '/d' | '/b'; children: ReactNode }) {
  const { usuario, cargando } = useSesion();
  if (cargando) return <Cargando />;
  if (!usuario) return <Navigate to="/acces" replace />;
  if (zonaDe(usuario.rol) !== zona) return <Navigate to={zonaDe(usuario.rol)} replace />;
  return <>{children}</>;
}

const MENU_DERIVADOR = [
  { a: '/d', texto: t('menu.derivaciones'), icono: ClipboardList, exacta: true },
  { a: '/d/nova', texto: t('menu.nueva'), icono: ClipboardPlus },
  { a: '/d/pacients', texto: t('menu.pacientes'), icono: PawPrint },
  { a: '/d/perfil', texto: t('menu.perfil'), icono: UserRound },
];

const MENU_BAMBU = [
  { a: '/b', texto: t('menu.inicio'), icono: LayoutDashboard, exacta: true },
  { a: '/b/casos', texto: t('menu.casos'), icono: ClipboardList },
  { a: '/b/pacients', texto: t('menu.pacientes'), icono: PawPrint },
  { a: '/b/cliniques', texto: t('menu.clinicas'), icono: Building2 },
  { a: '/b/panell', texto: t('menu.panel'), icono: ChartColumn },
  { a: '/b/configuracio', texto: t('menu.configuracion'), icono: Settings },
  { a: '/b/perfil', texto: t('menu.perfil'), icono: UserRound },
];

function NoEncontrada() {
  const { usuario } = useSesion();
  return (
    <div className="pantalla-acceso">
      <div className="caja-acceso">
        <img className="logo-acceso" src="/logo-bambu.png" alt="BAMBÚ Fisiovet" width={76} height={76} />
        <h1>{t('noEncontrada.titulo')}</h1>
        <p>{t('noEncontrada.texto')}</p>
        <Link to={usuario ? zonaDe(usuario.rol) : '/'} className="boton ancho">{t('noEncontrada.volver')}</Link>
      </div>
    </div>
  );
}

export function App() {
  return (
    <ProveedorSesion>
      <BrowserRouter>
        <Routes>
          <Route path="/" element={<Landing />} />
          <Route path="/acces" element={<Acceso />} />
          <Route path="/acces/recupera" element={<Recupera />} />
          <Route path="/acces/estableix/:token" element={<Establece />} />
          <Route path="/acces/verifica-correu" element={<VerificaCorreo />} />
          <Route path="/legal/privacitat" element={<Privacidad />} />

          <Route path="/d" element={<Guarda zona="/d"><Esqueleto zona="/d" menu={MENU_DERIVADOR} /></Guarda>}>
            <Route index element={<ListaCasos zona="/d" />} />
            <Route path="nova" element={<NovaDerivacion />} />
            <Route path="casos/:id" element={<FichaCaso zona="/d" />} />
            <Route path="casos/:id/informes/:iid" element={<InformeVista zona="/d" />} />
            <Route path="pacients" element={<ListaPacientes zona="/d" />} />
            <Route path="pacients/:id" element={<FichaPaciente zona="/d" />} />
            <Route path="perfil" element={<Perfil />} />
            <Route path="notificacions" element={<PaginaNotificaciones />} />
            <Route path="*" element={<NoEncontrada />} />
          </Route>

          <Route path="/b" element={<Guarda zona="/b"><Esqueleto zona="/b" menu={MENU_BAMBU} /></Guarda>}>
            <Route index element={<InicioBambu />} />
            <Route path="casos" element={<ListaCasos zona="/b" />} />
            <Route path="casos/:id" element={<FichaCaso zona="/b" />} />
            <Route path="casos/:id/informes/:iid" element={<InformeVista zona="/b" />} />
            <Route path="pacients" element={<ListaPacientes zona="/b" />} />
            <Route path="pacients/:id" element={<FichaPaciente zona="/b" />} />
            <Route path="cliniques" element={<Clinicas />} />
            <Route path="panell" element={<Panel />} />
            <Route path="configuracio/*" element={<Configuracion />} />
            <Route path="perfil" element={<Perfil />} />
            <Route path="notificacions" element={<PaginaNotificaciones />} />
            <Route path="*" element={<NoEncontrada />} />
          </Route>

          <Route path="*" element={<NoEncontrada />} />
        </Routes>
        <AvisoVersion />
      </BrowserRouter>
    </ProveedorSesion>
  );
}
