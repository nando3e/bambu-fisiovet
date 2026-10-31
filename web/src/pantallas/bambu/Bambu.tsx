// Zona de Bambú: portada con lo que pide atención y la lista de clínicas y
// veterinarios con las solicitudes de unión.
import { useCallback, useEffect, useState } from 'react';
import { Link } from 'react-router';
import { Bell, Building2, Check, ChevronDown, ChevronUp, MailWarning, UserCheck, Users, X } from 'lucide-react';
import { api, mensajeDe, type Notificacion } from '../../api.ts';
import { haceCuanto, t } from '../../i18n/index.ts';
import { useSesion } from '../../sesion.tsx';
import { Aviso, Cargando, TituloPagina, Vacio } from '../../componentes/comunes.tsx';
import { ListaNotificaciones, useAbrirNotificacion } from '../../componentes/Notificaciones.tsx';

interface Solicitud {
  id: number;
  creado: string;
  nombre: string;
  apellidos: string;
  email: string;
  clinica_origen: string;
  clinica_destino: string;
}

interface Clinica {
  id: number;
  nombre: string;
  poblacion: string | null;
  telefono: string | null;
  email: string | null;
  veterinarios: number;
}

export function InicioBambu() {
  const { usuario } = useSesion();
  const abrir = useAbrirNotificacion();
  const [datos, setDatos] = useState<{
    notificaciones: Notificacion[];
    noLeidas: number;
    solicitudes: number;
    clinicas: number;
    fallidos: number;
  } | null>(null);
  const [error, setError] = useState('');

  useEffect(() => {
    Promise.all([
      api.get<{ notificaciones: Notificacion[]; no_leidas: number }>('/notificaciones?limite=8'),
      api.get<{ clinicas: Clinica[]; solicitudes: Solicitud[] }>('/clinicas'),
      api.get<{ correos: { estado: string }[] }>('/configuracion/avisos/cola'),
    ])
      .then(([n, c, cola]) =>
        setDatos({
          notificaciones: n.notificaciones,
          noLeidas: n.no_leidas,
          solicitudes: c.solicitudes.length,
          clinicas: c.clinicas.length,
          fallidos: cola.correos.filter((x) => x.estado === 'fallido').length,
        }),
      )
      .catch((err) => setError(mensajeDe(err)));
  }, []);

  if (error) return <Aviso tipo="error">{error}</Aviso>;
  if (!datos || !usuario) return <Cargando />;
  return (
    <>
      <TituloPagina antetitulo="BAMBÚ Fisiovet" titulo={t('bambu.hola', { nombre: usuario.nombre })} subtitulo={t('bambu.subtitulo')} />
      <div className="rejilla-tarjetas">
        <Link to="/b/notificacions" className="cifra">
          <span className="icono-cifra"><Bell size={22} aria-hidden /></span>
          <div><strong>{datos.noLeidas}</strong><span>{t('bambu.noLeidas')}</span></div>
        </Link>
        <Link to="/b/cliniques" className="cifra">
          <span className="icono-cifra"><UserCheck size={22} aria-hidden /></span>
          <div><strong>{datos.solicitudes}</strong><span>{t('bambu.solicitudes')}</span></div>
        </Link>
        <Link to="/b/cliniques" className="cifra">
          <span className="icono-cifra"><Building2 size={22} aria-hidden /></span>
          <div><strong>{datos.clinicas}</strong><span>{t('bambu.clinicas')}</span></div>
        </Link>
        {datos.fallidos > 0 ? (
          <Link to="/b/configuracio/avisos" className="cifra">
            <span className="icono-cifra" style={{ background: 'var(--alerta-fondo)', color: 'var(--alerta)' }}><MailWarning size={22} aria-hidden /></span>
            <div><strong>{datos.fallidos}</strong><span>{t('bambu.correosFallidos')}</span></div>
          </Link>
        ) : null}
      </div>
      <h2 style={{ fontSize: '1.15rem' }}>{t('bambu.ultimosAvisos')}</h2>
      <ListaNotificaciones notificaciones={datos.notificaciones} alAbrir={(n) => void abrir(n)} />
      <p className="texto-suave" style={{ marginTop: 18, fontSize: '0.88rem' }}>{t('bambu.casosProximamente')}</p>
    </>
  );
}

export function Clinicas() {
  const [datos, setDatos] = useState<{ clinicas: Clinica[]; solicitudes: Solicitud[] } | null>(null);
  const [estado, setEstado] = useState<{ ok?: string; error?: string }>({});
  const [abierta, setAbierta] = useState<number | null>(null);

  const cargar = useCallback(async () => {
    try {
      setDatos(await api.get('/clinicas'));
    } catch (err) {
      setEstado({ error: mensajeDe(err) });
    }
  }, []);
  useEffect(() => {
    void cargar();
  }, [cargar]);

  async function resolver(id: number, aprobar: boolean) {
    setEstado({});
    try {
      await api.post(aprobar ? `/solicitudes-union/${id}/aprueba` : `/solicitudes-union/${id}/rechaza`);
      setEstado({ ok: aprobar ? t('clinica.aprobada') : t('clinica.rechazada') });
      await cargar();
    } catch (err) {
      setEstado({ error: mensajeDe(err) });
    }
  }

  if (!datos) return <Cargando />;
  return (
    <>
      <TituloPagina titulo={t('clinicas.titulo')} subtitulo={t('clinicas.subtitulo')} />
      {estado.ok ? <Aviso>{estado.ok}</Aviso> : null}
      {estado.error ? <Aviso tipo="error">{estado.error}</Aviso> : null}

      {datos.solicitudes.length > 0 ? (
        <section className="tarjeta">
          <h2>{t('clinica.solicitudesRecibidas')}</h2>
          <ul className="lista">
            {datos.solicitudes.map((s) => (
              <li key={s.id}>
                <div className="principal">
                  <strong>{`${s.nombre} ${s.apellidos}`.trim()} → {s.clinica_destino}</strong>
                  <span>{s.email} · {t('clinicas.desde', { clinica: s.clinica_origen })} · {haceCuanto(s.creado)}</span>
                </div>
                <button type="button" className="boton-icono" aria-label={t('clinica.aprobar')} onClick={() => resolver(s.id, true)}>
                  <Check size={20} aria-hidden />
                </button>
                <button type="button" className="boton-icono" aria-label={t('clinica.rechazar')} onClick={() => resolver(s.id, false)}>
                  <X size={20} aria-hidden />
                </button>
              </li>
            ))}
          </ul>
        </section>
      ) : null}

      {datos.clinicas.length === 0 ? (
        <Vacio icono={<Building2 size={32} aria-hidden />}>{t('clinicas.ninguna')}</Vacio>
      ) : (
        <ul className="lista">
          {datos.clinicas.map((c) => (
            <li key={c.id} style={{ flexWrap: 'wrap' }}>
              <span className="icono-fila"><Building2 size={18} aria-hidden /></span>
              <div className="principal">
                <strong>{c.nombre}</strong>
                <span>{[c.poblacion, c.telefono, c.email].filter(Boolean).join(' · ') || t('clinicas.sinDatos')}</span>
              </div>
              <span className="chip"><Users size={14} aria-hidden /> {c.veterinarios}</span>
              <button
                type="button"
                className="boton-icono"
                aria-expanded={abierta === c.id}
                aria-label={t('clinicas.verVeterinarios')}
                onClick={() => setAbierta(abierta === c.id ? null : c.id)}
              >
                {abierta === c.id ? <ChevronUp size={20} aria-hidden /> : <ChevronDown size={20} aria-hidden />}
              </button>
              {abierta === c.id ? <Veterinarios clinicaId={c.id} alCambiar={cargar} /> : null}
            </li>
          ))}
        </ul>
      )}
    </>
  );
}

function Veterinarios({ clinicaId, alCambiar }: { clinicaId: number; alCambiar: () => Promise<void> }) {
  const [lista, setLista] = useState<{
    id: number; nombre: string; apellidos: string; email: string; telefono: string | null;
    activo: boolean; verificado: boolean; ultimo_acceso: string | null;
  }[] | null>(null);
  const [error, setError] = useState('');
  const cargar = useCallback(async () => {
    const r = await api.get<{ usuarios: NonNullable<typeof lista> }>(`/clinicas/${clinicaId}/usuarios`);
    setLista(r.usuarios);
  }, [clinicaId]);
  useEffect(() => {
    cargar().catch((err) => setError(mensajeDe(err)));
  }, [cargar]);

  return (
    <div style={{ flexBasis: '100%', paddingTop: 10 }}>
      {error ? <Aviso tipo="error">{error}</Aviso> : null}
      {!lista ? <p className="texto-suave">{t('comun.cargando')}</p> : (
        <ul className="lista">
          {lista.map((u) => (
            <li key={u.id}>
              <div className="principal">
                <strong>{`${u.nombre} ${u.apellidos}`.trim()}</strong>
                <span>{[u.email, u.telefono].filter(Boolean).join(' · ')}</span>
              </div>
              {!u.verificado ? <span className="chip gris">{t('clinica.invitado')}</span> : null}
              <button
                type="button"
                className={u.activo ? 'boton-texto' : 'boton-secundario'}
                onClick={async () => {
                  try {
                    await api.patch(`/usuarios/${u.id}`, { activo: !u.activo });
                    await cargar();
                    await alCambiar();
                  } catch (err) {
                    setError(mensajeDe(err));
                  }
                }}
              >
                {u.activo ? t('equipo.desactivar') : t('equipo.reactivar')}
              </button>
            </li>
          ))}
        </ul>
      )}
    </div>
  );
}
