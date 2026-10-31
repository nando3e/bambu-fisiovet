// La campana de la cabecera y la lista de notificaciones.
//
// El contador se pide cada 60 segundos y al volver a la pestaña. En escritorio
// la campana abre un desplegable; en el móvil lleva a la página completa.
import { useCallback, useEffect, useRef, useState } from 'react';
import { Link, useNavigate } from 'react-router';
import {
  Bell, BellOff, Building2, CheckCheck, FileText, MessageSquare, Paperclip, Stethoscope,
  UserPlus, Users, type LucideIcon,
} from 'lucide-react';
import { api, type Notificacion } from '../api.ts';
import { haceCuanto, t } from '../i18n/index.ts';

const ICONOS: Record<string, LucideIcon> = {
  'mensaje.nuevo': MessageSquare,
  'adjunto.nuevo': Paperclip,
  'informe.publicado': FileText,
  'intervencion.registrada': Stethoscope,
  'usuario.derivador_alta': UserPlus,
  'usuario.bambu_alta': UserPlus,
  'usuario.solicita_union': Building2,
  'usuario.union_resuelta': Users,
};

export const EVENTO_NOTIFICACIONES = 'bambu:notificaciones';

/** Avisa a la campana de que el contador ha podido cambiar. */
export function avisarCambioNotificaciones() {
  window.dispatchEvent(new Event(EVENTO_NOTIFICACIONES));
}

export function ListaNotificaciones({ notificaciones, alAbrir }: {
  notificaciones: Notificacion[];
  alAbrir: (n: Notificacion) => void;
}) {
  if (notificaciones.length === 0) {
    return (
      <div className="vacio" style={{ border: 0 }}>
        <BellOff size={30} aria-hidden />
        <div>{t('notificaciones.ninguna')}</div>
      </div>
    );
  }
  return (
    <ul className="lista">
      {notificaciones.map((n) => {
        const Icono = ICONOS[n.tipo] ?? Bell;
        return (
          <li key={n.id} className={n.leida_el ? undefined : 'no-leida'}>
            <span className="icono-fila"><Icono size={18} aria-hidden /></span>
            <button
              type="button"
              className="principal"
              onClick={() => alAbrir(n)}
              style={{ background: 'none', border: 0, padding: 0, textAlign: 'left', cursor: 'pointer' }}
            >
              <strong>{n.titulo}</strong>
              <span>{n.cuerpo}</span>
              <span style={{ display: 'block', fontSize: '0.75rem' }}>{haceCuanto(n.creado)}</span>
            </button>
            {n.leida_el ? null : <span className="punto" aria-label={t('notificaciones.noLeida')} />}
          </li>
        );
      })}
    </ul>
  );
}

/** Marca como leída (si no lo estaba) y navega al enlace. */
export function useAbrirNotificacion() {
  const navegar = useNavigate();
  return useCallback(
    async (n: Notificacion) => {
      if (!n.leida_el) {
        await api.post(`/notificaciones/${n.id}/leida`).catch(() => {});
        avisarCambioNotificaciones();
      }
      navegar(n.enlace);
    },
    [navegar],
  );
}

export function Campana({ zona }: { zona: '/d' | '/b' }) {
  const [noLeidas, setNoLeidas] = useState(0);
  const [abierta, setAbierta] = useState(false);
  const [lista, setLista] = useState<Notificacion[] | null>(null);
  const caja = useRef<HTMLDivElement>(null);
  const navegar = useNavigate();
  const abrir = useAbrirNotificacion();

  const contar = useCallback(async () => {
    try {
      const r = await api.get<{ no_leidas: number }>('/notificaciones/resumen');
      setNoLeidas(r.no_leidas);
    } catch {
      /* sin red: se reintenta en el siguiente ciclo */
    }
  }, []);

  useEffect(() => {
    void contar();
    const intervalo = window.setInterval(contar, 60_000);
    const alVolver = () => {
      if (document.visibilityState === 'visible') void contar();
    };
    document.addEventListener('visibilitychange', alVolver);
    window.addEventListener(EVENTO_NOTIFICACIONES, contar);
    return () => {
      window.clearInterval(intervalo);
      document.removeEventListener('visibilitychange', alVolver);
      window.removeEventListener(EVENTO_NOTIFICACIONES, contar);
    };
  }, [contar]);

  useEffect(() => {
    if (!abierta) return;
    const fuera = (e: MouseEvent) => {
      if (caja.current && !caja.current.contains(e.target as Node)) setAbierta(false);
    };
    const escape = (e: KeyboardEvent) => e.key === 'Escape' && setAbierta(false);
    document.addEventListener('mousedown', fuera);
    document.addEventListener('keydown', escape);
    return () => {
      document.removeEventListener('mousedown', fuera);
      document.removeEventListener('keydown', escape);
    };
  }, [abierta]);

  async function pulsar() {
    if (window.matchMedia('(max-width: 899px)').matches) {
      navegar(`${zona}/notificacions`);
      return;
    }
    if (abierta) {
      setAbierta(false);
      return;
    }
    setAbierta(true);
    setLista(null);
    const r = await api.get<{ notificaciones: Notificacion[]; no_leidas: number }>('/notificaciones?limite=8');
    setLista(r.notificaciones);
    setNoLeidas(r.no_leidas);
  }

  async function marcarTodas() {
    await api.post('/notificaciones/leidas');
    setNoLeidas(0);
    setLista((l) => l?.map((n) => ({ ...n, leida_el: n.leida_el ?? new Date().toISOString() })) ?? null);
  }

  const etiqueta = noLeidas > 0 ? t('notificaciones.campanaCon', { n: noLeidas }) : t('notificaciones.campana');
  return (
    <div className="campana" ref={caja}>
      <button type="button" className="boton-icono" onClick={pulsar} aria-label={etiqueta} aria-expanded={abierta}>
        <Bell size={22} aria-hidden />
        {noLeidas > 0 ? <span className="insignia">{noLeidas > 99 ? '99+' : noLeidas}</span> : null}
      </button>
      {abierta ? (
        <div className="desplegable">
          <header>
            <span>{t('notificaciones.titulo')}</span>
            {noLeidas > 0 ? (
              <button type="button" className="boton-texto" onClick={marcarTodas}>
                <CheckCheck size={16} aria-hidden /> {t('notificaciones.marcarTodas')}
              </button>
            ) : null}
          </header>
          {lista === null ? (
            <p className="texto-suave" style={{ padding: 16 }}>{t('comun.cargando')}</p>
          ) : (
            <ListaNotificaciones
              notificaciones={lista}
              alAbrir={(n) => {
                setAbierta(false);
                void abrir(n);
              }}
            />
          )}
          <footer>
            <Link to={`${zona}/notificacions`} className="boton-texto" onClick={() => setAbierta(false)}>
              {t('notificaciones.verTodas')}
            </Link>
          </footer>
        </div>
      ) : null}
    </div>
  );
}
