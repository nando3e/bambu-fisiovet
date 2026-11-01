// Panel de indicadores de Bambú (/b/panell): seis bloques, cada uno ligado a
// una decisión, con barras de CSS (sin librería de gráficas) y cada cifra
// enlazada a la lista de casos con su filtro. Las visitas van en Wakyma: aquí
// no se cuentan sesiones.
import { useEffect, useState, type ReactNode } from 'react';
import { Link } from 'react-router';
import { AlertTriangle, CalendarClock, FileText, Inbox, Stethoscope } from 'lucide-react';
import { api, mensajeDe } from '../../api.ts';
import { haceCuanto, t, type ClaveTexto } from '../../i18n/index.ts';
import { Aviso, CampoSelector, Cargando, TituloPagina } from '../../componentes/comunes.tsx';

interface Indicadores {
  rango: { desde: string; hasta: string };
  por_mes: { mes: string; n: number }[];
  clinicas: { id: number; nombre: string; n: number; ultima: string; sin_derivar: boolean }[];
  respuesta: { mediana_horas: number | null; resueltas: number; en_24h: number; sin_resolver: number };
  embudo: {
    enviadas: number; aceptadas: number; con_cita: number; alta: number; pendientes_cita: number;
    rechazadas: number; abandonadas: number; sin_respuesta: number;
  };
  activos: { enviada: number; aceptada: number; en_tratamiento: number };
  duracion: { altas: number; con_visita: number; espera_dias: number | null; tratamiento_dias: number | null };
  operativos: { atascados: number; propuestas_pendientes: number; dias_pendiente_cita: number };
}

const RANGOS = ['m3', 'm6', 'm12', 'm24', 'anyPassat'] as const;
type Rango = (typeof RANGOS)[number];

/** Hoy en el calendario de Bambú (Madrid), como el servidor, sea cual sea el huso del navegador. */
const hoyEnMadrid = () => new Intl.DateTimeFormat('en-CA', { timeZone: 'Europe/Madrid' }).format(new Date());

/** Fechas del rango elegido: meses enteros hasta hoy, o el año pasado entero. */
function fechasDe(rango: Rango): { desde: string; hasta: string } {
  const hoy = hoyEnMadrid();
  const [a, m] = hoy.split('-').map(Number) as [number, number];
  if (rango === 'anyPassat') return { desde: `${a - 1}-01-01`, hasta: `${a - 1}-12-31` };
  const meses = Number(rango.slice(1));
  return { desde: new Date(Date.UTC(a, m - meses, 1)).toISOString().slice(0, 10), hasta: hoy };
}

const NUMERO = new Intl.NumberFormat('ca-ES', { maximumFractionDigits: 1 });
const MES = new Intl.DateTimeFormat('ca-ES', { month: 'short', year: '2-digit', timeZone: 'UTC' });

/** Una fila de barra: etiqueta, barra proporcional al máximo y la cifra escrita. */
function Barra({ etiqueta, n, maximo, enlace }: { etiqueta: ReactNode; n: number; maximo: number; enlace?: string }) {
  const contenido = (
    <>
      <span className="barra-etiqueta">{etiqueta}</span>
      <span className="barra-fondo"><span className="barra-relleno" style={{ width: `${maximo ? (n / maximo) * 100 : 0}%` }} /></span>
      <strong>{n}</strong>
    </>
  );
  return enlace ? <Link to={enlace} className="barra-fila">{contenido}</Link> : <div className="barra-fila">{contenido}</div>;
}

function Cifra({ enlace, icono, n, texto, alerta = false }: { enlace: string; icono: ReactNode; n: number; texto: string; alerta?: boolean }) {
  return (
    <Link to={enlace} className="cifra">
      <span className="icono-cifra" style={alerta ? { background: 'var(--alerta-fondo)', color: 'var(--alerta)' } : undefined}>{icono}</span>
      <div><strong>{n}</strong><span>{texto}</span></div>
    </Link>
  );
}

export function Panel() {
  const [rango, setRango] = useState<Rango>('m12');
  const [datos, setDatos] = useState<Indicadores | null>(null);
  const [error, setError] = useState('');

  useEffect(() => {
    setDatos(null);
    const { desde, hasta } = fechasDe(rango);
    api.get<Indicadores>(`/panel/indicadores?desde=${desde}&hasta=${hasta}`)
      .then(setDatos)
      .catch((err) => setError(mensajeDe(err)));
  }, [rango]);

  const selector = (
    <CampoSelector etiqueta={t('panel.rango')} value={rango} onChange={(e) => setRango(e.target.value as Rango)}>
      {RANGOS.map((r) => <option key={r} value={r}>{t(`panel.rango.${r}` as ClaveTexto)}</option>)}
    </CampoSelector>
  );

  if (error) return <Aviso tipo="error">{error}</Aviso>;
  return (
    <>
      <TituloPagina antetitulo={t('marca')} titulo={t('panel.titulo')} subtitulo={t('panel.subtitulo')}>{selector}</TituloPagina>
      {!datos ? <Cargando /> : <Bloques d={datos} />}
    </>
  );
}

function Bloques({ d }: { d: Indicadores }) {
  const maxMes = Math.max(0, ...d.por_mes.map((m) => m.n));
  const maxClinica = Math.max(0, ...d.clinicas.map((c) => c.n));
  const e = d.embudo;
  const dias = (n: number | null) => (n === null ? t('panel.sinDatos') : t('panel.dias', { n: NUMERO.format(n) }));
  return (
    <>
      <h2 className="seccion-panel">{t('panel.ahora')}</h2>
      <div className="rejilla-tarjetas">
        <Cifra enlace="/b/casos?f=noves" icono={<Inbox size={22} aria-hidden />} n={d.activos.enviada} texto={t('panel.activos.enviada')} />
        <Cifra enlace="/b/casos?f=pendientes" icono={<CalendarClock size={22} aria-hidden />} n={d.activos.aceptada} texto={t('bambu.pendientesCita')} />
        <Cifra enlace="/b/casos?f=tratamiento" icono={<Stethoscope size={22} aria-hidden />} n={d.activos.en_tratamiento} texto={t('bambu.enTratamiento')} />
        <Cifra
          enlace="/b/casos?f=atascados" icono={<AlertTriangle size={22} aria-hidden />} n={d.operativos.atascados}
          texto={t('bambu.atascados', { n: d.operativos.dias_pendiente_cita })} alerta={d.operativos.atascados > 0}
        />
        <Cifra enlace="/b/casos?propuestas=1" icono={<FileText size={22} aria-hidden />} n={d.operativos.propuestas_pendientes} texto={t('bambu.propuestasPendientes')} />
      </div>

      <div className="rejilla-panel">
        <section className="tarjeta">
          <h2>{t('panel.porMes')}</h2>
          {maxMes === 0 ? <p className="texto-suave">{t('panel.vacio')}</p> : null}
          <div className="barras-panel">
            {d.por_mes.map((m) => <Barra key={m.mes} etiqueta={MES.format(new Date(`${m.mes}-01T00:00:00Z`))} n={m.n} maximo={maxMes} />)}
          </div>
        </section>

        <section className="tarjeta">
          <h2>{t('panel.clinicas')}</h2>
          {d.clinicas.length === 0 ? <p className="texto-suave">{t('panel.vacio')}</p> : null}
          <div className="barras-panel anchas">
            {d.clinicas.map((c) => (
              <Barra
                key={c.id}
                enlace={`/b/casos?clinica=${c.id}`}
                maximo={maxClinica}
                n={c.n}
                etiqueta={(
                  <>
                    {c.nombre}
                    <small className={c.sin_derivar ? 'chip atencion' : 'texto-suave'}>
                      {c.sin_derivar ? t('panel.sinDerivar') : t('panel.ultima', { cuando: haceCuanto(c.ultima) })}
                    </small>
                  </>
                )}
              />
            ))}
          </div>
        </section>

        <section className="tarjeta">
          <h2>{t('panel.respuesta')}</h2>
          <p className="ayuda">{t('panel.respuesta.ayuda')}</p>
          <p className="cifra-grande">
            {d.respuesta.mediana_horas === null ? t('panel.sinDatos') : t('panel.horas', { n: NUMERO.format(d.respuesta.mediana_horas) })}
            <small>{t('panel.mediana')}</small>
          </p>
          {d.respuesta.resueltas ? <p>{t('panel.en24h', { n: d.respuesta.en_24h, total: d.respuesta.resueltas })}</p> : null}
          {d.respuesta.sin_resolver ? <p><Link to="/b/casos?f=noves">{t('panel.sinResolver', { n: d.respuesta.sin_resolver })}</Link></p> : null}
        </section>

        <section className="tarjeta">
          <h2>{t('panel.embudo')}</h2>
          <div className="barras-panel">
            <Barra etiqueta={t('panel.embudo.enviadas')} n={e.enviadas} maximo={e.enviadas} />
            <Barra etiqueta={t('panel.embudo.aceptadas')} n={e.aceptadas} maximo={e.enviadas} />
            <Barra etiqueta={t('panel.embudo.conCita')} n={e.con_cita} maximo={e.enviadas} />
            <Barra etiqueta={t('panel.embudo.alta')} n={e.alta} maximo={e.enviadas} />
          </div>
          <p className="texto-suave">{t('panel.embudo.perdidas', { r: e.rechazadas, a: e.abandonadas, s: e.sin_respuesta })}</p>
          {e.pendientes_cita ? <p><Link to="/b/casos?f=pendientes">{t('panel.embudo.pendientes', { n: e.pendientes_cita })}</Link></p> : null}
        </section>

        <section className="tarjeta">
          <h2>{t('panel.duracion')}</h2>
          <p className="ayuda">{t('panel.duracion.ayuda', { n: d.duracion.con_visita, total: d.duracion.altas })}</p>
          <dl className="datos">
            <div><dt>{t('panel.espera')}</dt><dd>{dias(d.duracion.espera_dias)}</dd></div>
            <div><dt>{t('panel.tratamiento')}</dt><dd>{dias(d.duracion.tratamiento_dias)}</dd></div>
          </dl>
        </section>
      </div>
    </>
  );
}
