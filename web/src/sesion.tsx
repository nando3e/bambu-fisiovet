// La sesión del usuario: quién es y a qué zona va. Se pide al cargar y se
// borra en cuanto una llamada privada dice que ya no vale.
import { createContext, useCallback, useContext, useEffect, useState, type ReactNode } from 'react';
import { api, EVENTO_SESION_CADUCADA, type Rol, type Usuario } from './api.ts';

interface ContextoSesion {
  usuario: Usuario | null;
  cargando: boolean;
  fijar: (u: Usuario | null) => void;
  recargar: () => Promise<void>;
  salir: () => Promise<void>;
}

const Contexto = createContext<ContextoSesion | null>(null);

export function ProveedorSesion({ children }: { children: ReactNode }) {
  const [usuario, fijar] = useState<Usuario | null>(null);
  const [cargando, setCargando] = useState(true);

  const recargar = useCallback(async () => {
    try {
      fijar(await api.get<Usuario>('/auth/yo'));
    } catch {
      fijar(null);
    } finally {
      setCargando(false);
    }
  }, []);

  const salir = useCallback(async () => {
    await api.post('/auth/salir').catch(() => {});
    fijar(null);
  }, []);

  useEffect(() => {
    void recargar();
    const caducada = () => fijar(null);
    window.addEventListener(EVENTO_SESION_CADUCADA, caducada);
    return () => window.removeEventListener(EVENTO_SESION_CADUCADA, caducada);
  }, [recargar]);

  return (
    <Contexto.Provider value={{ usuario, cargando, fijar, recargar, salir }}>
      {children}
    </Contexto.Provider>
  );
}

export function useSesion(): ContextoSesion {
  const c = useContext(Contexto);
  if (!c) throw new Error('useSesion fuera de ProveedorSesion');
  return c;
}

/** La portada de la zona de cada rol. */
export function zonaDe(rol: Rol): '/d' | '/b' {
  return rol === 'derivador' ? '/d' : '/b';
}

export const esBambu = (u: Usuario | null) => u?.rol === 'bambu' || u?.rol === 'superadmin';
