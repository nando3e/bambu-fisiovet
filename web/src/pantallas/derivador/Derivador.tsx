// Zona del veterinario. En este change: la portada y «Nova derivació», que
// avisan de lo que llega con el change casos-y-derivaciones.
import { useEffect, useState } from 'react';
import { Link } from 'react-router';
import { Bell, Building2, ClipboardList, Stethoscope, UserRound } from 'lucide-react';
import { api } from '../../api.ts';
import { t } from '../../i18n/index.ts';
import { useSesion } from '../../sesion.tsx';
import { TituloPagina } from '../../componentes/comunes.tsx';

export function InicioDerivador() {
  const { usuario } = useSesion();
  const [noLeidas, setNoLeidas] = useState<number | null>(null);
  useEffect(() => {
    api.get<{ no_leidas: number }>('/notificaciones/resumen').then((r) => setNoLeidas(r.no_leidas)).catch(() => {});
  }, []);
  if (!usuario) return null;
  return (
    <>
      <TituloPagina
        antetitulo={usuario.clinica?.nombre}
        titulo={t('derivador.hola', { nombre: usuario.nombre })}
        subtitulo={t('derivador.subtitulo')}
      />
      <div className="rejilla-tarjetas">
        <Link to="/d/nova" className="cifra">
          <span className="icono-cifra"><ClipboardList size={22} aria-hidden /></span>
          <div>
            <strong style={{ fontSize: '1.1rem' }}>{t('derivador.nueva')}</strong>
            <span>{t('derivador.nuevaAyuda')}</span>
          </div>
        </Link>
        <Link to="/d/notificacions" className="cifra">
          <span className="icono-cifra"><Bell size={22} aria-hidden /></span>
          <div>
            <strong>{noLeidas ?? '·'}</strong>
            <span>{t('derivador.avisosPendientes')}</span>
          </div>
        </Link>
        <Link to="/d/perfil" className="cifra">
          <span className="icono-cifra"><Building2 size={22} aria-hidden /></span>
          <div>
            <strong style={{ fontSize: '1.1rem' }}>{t('derivador.clinica')}</strong>
            <span>{t('derivador.clinicaAyuda')}</span>
          </div>
        </Link>
      </div>
      <section className="tarjeta">
        <h2 style={{ display: 'flex', gap: 8, alignItems: 'center' }}><Stethoscope size={18} aria-hidden /> {t('derivador.comoFunciona')}</h2>
        <ol style={{ paddingLeft: 20, margin: 0, color: 'var(--texto-suave)' }}>
          <li>{t('derivador.paso1')}</li>
          <li>{t('derivador.paso2')}</li>
          <li>{t('derivador.paso3')}</li>
        </ol>
      </section>
    </>
  );
}

export function NovaDerivacion() {
  return (
    <>
      <TituloPagina antetitulo={t('derivador.nueva')} titulo={t('nova.titulo')} subtitulo={t('nova.subtitulo')} />
      <section className="tarjeta">
        <p>{t('nova.proximamente')}</p>
        <Link to="/d/perfil" className="boton-secundario"><UserRound size={18} aria-hidden /> {t('nova.completaPerfil')}</Link>
      </section>
    </>
  );
}
