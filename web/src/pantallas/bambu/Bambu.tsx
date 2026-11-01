// Zona de Bambú: portada con lo que pide atención (derivaciones nuevas,
// pendientes de cita, encalladas) y la lista de clínicas y veterinarios. Las
// clínicas las dan de alta sus veterinarios; Bambú las edita (el CIF) y
// desactiva a quien haga falta, pero no crea clínicas ni derivaciones.
import { useCallback, useEffect, useState } from 'react';
import { Link } from 'react-router';
import {
  AlertTriangle, Bell, Building2, CalendarClock, ChevronDown, ChevronUp, ClipboardList, FileText, Inbox, MailWarning,
  Pencil, Stethoscope, Users,
} from 'lucide-react';
import { api, ErrorApi, mensajeDe, type Notificacion } from '../../api.ts';
import { haceCuanto, t, type ClaveTexto } from '../../i18n/index.ts';
import { useSesion } from '../../sesion.tsx';
import { Aviso, Campo, Cargando, TituloPagina, Vacio } from '../../componentes/comunes.tsx';
import { ListaNotificaciones, useAbrirNotificacion } from '../../componentes/Notificaciones.tsx';

interface Clinica {
  id: number;
  nombre: string;
  poblacion: string | null;
  direccion: string | null;
  codigo_postal: string | null;
  telefono: string | null;
  email: string | null;
  cif: string | null;
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
    sinCif: number;
    clinicas: number;
    fallidos: number;
  } | null>(null);
  const [error, setError] = useState('');

  useEffect(() => {
    Promise.all([
      api.get<{ notificaciones: Notificacion[]; no_leidas: number }>('/notificaciones?limite=8'),
      api.get<{ clinicas: Clinica[] }>('/clinicas'),
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
          sinCif: c.clinicas.filter((x) => !x.cif).length,
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
      <TituloPagina antetitulo={t('marca')} titulo={t('bambu.hola', { nombre: usuario.nombre })} subtitulo={t('bambu.subtitulo')} />
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
          <span className="icono-cifra"><Building2 size={22} aria-hidden /></span>
          <div><strong>{datos.clinicas}</strong><span>{t('bambu.clinicas')}</span></div>
        </Link>
        {datos.sinCif > 0 ? (
          <Link to="/b/cliniques" className="cifra">
            <span className="icono-cifra" style={{ background: 'var(--aviso-fondo)', color: 'var(--aviso-texto)' }}><Building2 size={22} aria-hidden /></span>
            <div><strong>{datos.sinCif}</strong><span>{t('bambu.sinCif')}</span></div>
          </Link>
        ) : null}
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

interface FichaClinica { nombre: string; poblacion: string; cif: string; telefono: string; email: string }

/** Los campos de una clínica, con los errores del servidor en cada uno. */
function CamposClinica({ ficha, cambiar, errores }: {
  ficha: FichaClinica; cambiar: (f: FichaClinica) => void; errores: Record<string, string>;
}) {
  return (
    <div className="formulario dos">
      <Campo etiqueta={t('clinica.nombre')} value={ficha.nombre} onChange={(e) => cambiar({ ...ficha, nombre: e.target.value })} error={errores.nombre} required />
      <Campo etiqueta={t('clinica.poblacion')} value={ficha.poblacion} onChange={(e) => cambiar({ ...ficha, poblacion: e.target.value })} error={errores.poblacion} required />
      <Campo etiqueta={t('alta.cif')} value={ficha.cif} onChange={(e) => cambiar({ ...ficha, cif: e.target.value })} error={errores.cif} autoCapitalize="characters" required />
      <Campo etiqueta={t('clinica.telefono')} type="tel" value={ficha.telefono} onChange={(e) => cambiar({ ...ficha, telefono: e.target.value })} error={errores.telefono} />
      <Campo className="entero" etiqueta={t('clinica.email')} type="email" value={ficha.email} onChange={(e) => cambiar({ ...ficha, email: e.target.value })} error={errores.email} />
    </div>
  );
}

const camposDe = (err: unknown) => (err instanceof ErrorApi && err.campos ? err.campos : {});

export function Clinicas() {
  const [datos, setDatos] = useState<{ clinicas: Clinica[] } | null>(null);
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

  if (!datos) return <Cargando />;
  return (
    <>
      <TituloPagina titulo={t('clinicas.titulo')} subtitulo={t('clinicas.subtitulo')} ayuda="ayuda.clinicas" />
      {estado.ok ? <Aviso>{estado.ok}</Aviso> : null}
      {estado.error ? <Aviso tipo="error">{estado.error}</Aviso> : null}

      {datos.clinicas.length === 0 ? (
        <Vacio icono={<Building2 size={32} aria-hidden />}>{t('clinicas.ninguna')}</Vacio>
      ) : (
        <ul className="lista">
          {datos.clinicas.map((c) => (
            <li key={c.id} style={{ flexWrap: 'wrap' }}>
              <span className="icono-fila"><Building2 size={18} aria-hidden /></span>
              <div className="principal">
                <strong>{c.nombre}</strong>
                <span>{[c.cif, c.poblacion, c.telefono, c.email].filter(Boolean).join(' · ') || t('clinicas.sinDatos')}</span>
              </div>
              {!c.cif ? <span className="chip atencion">{t('clinicas.sinCif')}</span> : null}
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
              {abierta === c.id ? <DetalleClinica clinica={c} alCambiar={cargar} /> : null}
            </li>
          ))}
        </ul>
      )}
    </>
  );
}

/** Al desplegar una clínica: sus veterinarios (para desactivar) y editar sus datos. */
function DetalleClinica({ clinica, alCambiar }: { clinica: Clinica; alCambiar: () => Promise<void> }) {
  const [lista, setLista] = useState<{
    id: number; nombre: string; apellidos: string; email: string; telefono: string | null;
    activo: boolean; verificado: boolean; ultimo_acceso: string | null;
  }[] | null>(null);
  const [estado, setEstado] = useState<{ ok?: string; error?: string }>({});
  const [ficha, setFicha] = useState<FichaClinica | null>(null);
  const [errores, setErrores] = useState<Record<string, string>>({});
  const cargar = useCallback(async () => {
    const r = await api.get<{ usuarios: NonNullable<typeof lista> }>(`/clinicas/${clinica.id}/usuarios`);
    setLista(r.usuarios);
  }, [clinica.id]);
  useEffect(() => {
    cargar().catch((err) => setEstado({ error: mensajeDe(err) }));
  }, [cargar]);

  async function guardar() {
    if (!ficha) return;
    setEstado({});
    setErrores({});
    try {
      await api.patch(`/clinicas/${clinica.id}`, ficha);
      setFicha(null);
      await alCambiar();
    } catch (err) {
      setErrores(camposDe(err));
      setEstado({ error: mensajeDe(err) });
    }
  }

  return (
    <div style={{ flexBasis: '100%', paddingTop: 10 }}>
      {estado.ok ? <Aviso>{estado.ok}</Aviso> : null}
      {estado.error ? <Aviso tipo="error">{estado.error}</Aviso> : null}
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
                    setEstado({ error: mensajeDe(err) });
                  }
                }}
              >
                {u.activo ? t('equipo.desactivar') : t('equipo.reactivar')}
              </button>
            </li>
          ))}
        </ul>
      )}

      {ficha ? (
        <>
          <h3 style={{ fontSize: '1rem', marginTop: 14 }}>{t('clinicas.editar')}</h3>
          <CamposClinica ficha={ficha} cambiar={setFicha} errores={errores} />
          <div className="acciones">
            <button type="button" className="boton" onClick={() => void guardar()}>{t('comun.guardar')}</button>
            <button type="button" className="boton-texto" onClick={() => setFicha(null)}>{t('caso.cancelar')}</button>
          </div>
        </>
      ) : (
        <div className="acciones">
          <button
            type="button"
            className="boton-texto"
            onClick={() => {
              setErrores({});
              setFicha({
                nombre: clinica.nombre, poblacion: clinica.poblacion ?? '', cif: clinica.cif ?? '',
                telefono: clinica.telefono ?? '', email: clinica.email ?? '',
              });
            }}
          >
            <Pencil size={16} aria-hidden /> {t('clinicas.editar')}
          </button>
        </div>
      )}
    </div>
  );
}
