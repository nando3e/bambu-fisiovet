// El esqueleto de las zonas privadas: cabecera con logo y campana, y la
// navegación (abajo en el móvil, a la izquierda en escritorio).
import { NavLink, Outlet } from 'react-router';
import type { LucideIcon } from 'lucide-react';
import { Campana } from './Notificaciones.tsx';
import { Marca } from './comunes.tsx';
import { t } from '../i18n/index.ts';

export interface EntradaMenu {
  a: string;
  texto: string;
  icono: LucideIcon;
  /** Activa solo si la ruta es exactamente esta (la portada de la zona). */
  exacta?: boolean;
}

export function Esqueleto({ zona, menu }: { zona: '/d' | '/b'; menu: EntradaMenu[] }) {
  return (
    <div className="app">
      <header className="cabecera">
        <Marca a={zona} />
        <Campana zona={zona} />
      </header>
      <nav className="navegacion" aria-label={t('menu.etiqueta')}>
        {menu.map(({ a, texto, icono: Icono, exacta }) => (
          <NavLink key={a} to={a} end={exacta} className={({ isActive }) => (isActive ? 'activo' : undefined)}>
            <Icono size={22} aria-hidden />
            <span>{texto}</span>
          </NavLink>
        ))}
      </nav>
      <main className="contenido">
        <Outlet />
      </main>
    </div>
  );
}
