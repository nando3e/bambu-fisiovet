// Zona de Bambú: portada con lo que pide atención (derivaciones nuevas,
// pendientes de cita, encalladas) y la lista de clínicas y veterinarios con
// las solicitudes de unión.
import { useCallback, useEffect, useState } from 'react';
import { Link } from 'react-router';
import {
  AlertTriangle, Bell, Building2, CalendarClock, Check, ChevronDown, ChevronUp, ClipboardList, FileText, Inbox, MailWarning,
  PhoneCall, Plus, ShieldCheck, Stethoscope, UserCheck, Users, X,
} from 'lucide-react';
import { api, mensajeDe, type Notificacion } from '../../api.ts';
import { haceCuanto, t, type ClaveTexto } from '../../i18n/index.ts';
import { useSesion } from '../../sesion.tsx';
import { Aviso, Campo, Cargando, TituloPagina, Vacio } from '../../componentes/comunes.tsx';
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
  direccion: string | null;
  codigo_postal: string | null;
  telefono: string | null;
  email: string | null;
  validada: boolean;
  veterinarios: number;
  derivaciones: number;
}

interface Movimiento {
  id: number;
  tipo: string;
  creado: string;
  caso_id: number;
  paciente: string;
  clinica: string;
  actor: string | null;
}

interface Contadores {
  sin_abrir: number;
  noves: number;
  pendientes_cita: number;
  atascados: number;
  en_tratamiento: number;
  propuestas_pendientes: number;
  dias_pendiente_cita: number;
}

export function InicioBambu() {
  const { usuario } = useSesion();
  const abrir = useAbrirNotificacion();
  const [datos, setDatos] = useState<{
    notificaciones: Notificacion[];
    noLeidas: number;
    contadores: Contadores;
    movimientos: Movimiento[];
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
      api.get<Contadores>('/panel/contadores'),
      api.get<{ movimientos: Movimiento[] }>('/panel/movimientos'),
    ])
      .then(([n, c, cola, contadores, m]) =>
        setDatos({
          notificaciones: n.notificaciones,
          noLeidas: n.no_leidas,
          contadores,
          movimientos: m.movimientos,
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
      <TituloPagina antetitulo={t('marca')} titulo={t('bambu.hola', { nombre: usuario.nombre })} subtitulo={t('bambu.subtitulo')}>
        <Link to="/b/casos/nou" className="boton-secundario"><PhoneCall size={18} aria-hidden /> {t('bambu.registrar')}</Link>
      </TituloPagina>
      <div className="rejilla-tarjetas">
        <Link to="/b/casos?f=sin_abrir" className="cifra">
          <span className="icono-cifra"><Inbox size={22} aria-hidden /></span>
          <div><strong>{datos.contadores.sin_abrir}</strong><span>{t('bambu.sinAbrir')}</span></div>
        </Link>
        <Link to="/b/casos?f=pendientes" className="cifra">
          <span className="icono-cifra"><CalendarClock size={22} aria-hidden /></span>
          <div><strong>{datos.contadores.pendientes_cita}</strong><span>{t('bambu.pendientesCita')}</span></div>
        </Link>
        {datos.contadores.atascados > 0 ? (
          <Link to="/b/casos?f=atascados" className="cifra">
            <span className="icono-cifra" style={{ background: 'var(--alerta-fondo)', color: 'var(--alerta)' }}><AlertTriangle size={22} aria-hidden /></span>
            <div><strong>{datos.contadores.atascados}</strong><span>{t('bambu.atascados', { n: datos.contadores.dias_pendiente_cita })}</span></div>
          </Link>
        ) : null}
        <Link to="/b/casos?f=tratamiento" className="cifra">
          <span className="icono-cifra"><Stethoscope size={22} aria-hidden /></span>
          <div><strong>{datos.contadores.en_tratamiento}</strong><span>{t('bambu.enTratamiento')}</span></div>
        </Link>
        {datos.contadores.propuestas_pendientes > 0 ? (
          <Link to="/b/casos?propuestas=1" className="cifra">
            <span className="icono-cifra" style={{ background: 'var(--aviso-fondo)', color: 'var(--aviso-texto)' }}><FileText size={22} aria-hidden /></span>
            <div><strong>{datos.contadores.propuestas_pendientes}</strong><span>{t('bambu.propuestasPendientes')}</span></div>
          </Link>
        ) : null}
      </div>
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
      <h2 style={{ fontSize: '1.15rem' }}>{t('bambu.movimientos')}</h2>
      {datos.movimientos.length === 0 ? <p className="texto-suave">{t('bambu.sinMovimientos')}</p> : (
        <ul className="lista" style={{ marginBottom: 22 }}>
          {datos.movimientos.map((m) => (
            <li key={m.id}>
              <Link to={`/b/casos/${m.caso_id}`} className="fila-enlace">
                <div className="principal">
                  <strong>{t(`evento.${m.tipo}` as ClaveTexto)} · {m.paciente}</strong>
                  <span>{[m.clinica, m.actor, haceCuanto(m.creado)].filter(Boolean).join(' · ')}</span>
                </div>
              </Link>
            </li>
          ))}
        </ul>
      )}
      <h2 style={{ fontSize: '1.15rem' }}>{t('bambu.ultimosAvisos')}</h2>
      <ListaNotificaciones notificaciones={datos.notificaciones} alAbrir={(n) => void abrir(n)} />
      <p style={{ marginTop: 18 }}><Link to="/b/casos" className="boton-texto"><ClipboardList size={16} aria-hidden /> {t('menu.casos')}</Link></p>
    </>
  );
}

export function Clinicas() {
  const [datos, setDatos] = useState<{ clinicas: Clinica[]; solicitudes: Solicitud[] } | null>(null);
  const [estado, setEstado] = useState<{ ok?: string; error?: string }>({});
  const [abierta, setAbierta] = useState<number | null>(null);
  const [nueva, setNueva] = useState<{ nombre: string; poblacion: string; telefono: string; email: string } | null>(null);

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

  async function crear() {
    if (!nueva) return;
    setEstado({});
    try {
      await api.post('/clinicas', nueva);
      setNueva(null);
      setEstado({ ok: t('clinicas.creada') });
      await cargar();
    } catch (err) {
      setEstado({ error: mensajeDe(err) });
    }
  }

  async function validar(c: Clinica) {
    setEstado({});
    try {
      await api.patch(`/clinicas/${c.id}`, {
        nombre: c.nombre, poblacion: c.poblacion ?? '', direccion: c.direccion ?? '', codigo_postal: c.codigo_postal ?? '',
        telefono: c.telefono ?? '', email: c.email ?? '', validada: !c.validada,
      });
      await cargar();
    } catch (err) {
      setEstado({ error: mensajeDe(err) });
    }
  }

  if (!datos) return <Cargando />;
  return (
    <>
      <TituloPagina titulo={t('clinicas.titulo')} subtitulo={t('clinicas.subtitulo')} ayuda="ayuda.clinicas">
        <button type="button" className="boton-secundario" onClick={() => setNueva({ nombre: '', poblacion: '', telefono: '', email: '' })}>
          <Plus size={18} aria-hidden /> {t('clinicas.nueva')}
        </button>
      </TituloPagina>
      {nueva ? (
        <section className="tarjeta">
          <h2>{t('clinicas.nueva')}</h2>
          <div className="formulario dos">
            <Campo etiqueta={t('clinica.nombre')} value={nueva.nombre} onChange={(e) => setNueva({ ...nueva, nombre: e.target.value })} />
            <Campo etiqueta={t('clinica.poblacion')} value={nueva.poblacion} onChange={(e) => setNueva({ ...nueva, poblacion: e.target.value })} />
            <Campo etiqueta={t('clinica.telefono')} type="tel" value={nueva.telefono} onChange={(e) => setNueva({ ...nueva, telefono: e.target.value })} />
            <Campo etiqueta={t('clinica.email')} type="email" value={nueva.email} onChange={(e) => setNueva({ ...nueva, email: e.target.value })} />
          </div>
          <div className="acciones">
            <button type="button" className="boton" disabled={nueva.nombre.trim().length < 2} onClick={() => void crear()}>{t('comun.guardar')}</button>
            <button type="button" className="boton-texto" onClick={() => setNueva(null)}>{t('caso.cancelar')}</button>
          </div>
        </section>
      ) : null}
      <p className="texto-suave" style={{ fontSize: '0.88rem' }}>{t('clinicas.validarAyuda')}</p>
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
              <button
                type="button"
                className={c.validada ? 'chip' : 'chip gris'}
                title={c.validada ? t('clinicas.desvalidar') : t('clinicas.validar')}
                onClick={() => void validar(c)}
              >
                <ShieldCheck size={14} aria-hidden /> {c.validada ? t('clinicas.validada') : t('clinicas.sinValidar')}
              </button>
              <span className="chip gris" title={t('clinicas.derivaciones')}><ClipboardList size={14} aria-hidden /> {c.derivaciones}</span>
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
