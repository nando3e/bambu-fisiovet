// Pestaña Informes de la ficha y vista imprimible de un informe. Bambú dicta
// notas, pide un borrador (con IA o a mano), lo revisa, lo regenera o lo edita
// y solo cuando lo confirma sale hacia el veterinario.
import { useCallback, useEffect, useState } from 'react';
import { Link, useNavigate, useParams } from 'react-router';
import { AlertTriangle, ArrowLeft, Check, FileText, PenLine, Printer, RefreshCw, Sparkles, Trash2, X } from 'lucide-react';
import { api, ErrorApi, mensajeDe } from '../../api.ts';
import { fecha, t, type ClaveTexto } from '../../i18n/index.ts';
import { useSesion } from '../../sesion.tsx';
import { Aviso, Campo, CampoSelector, CampoTexto, Cargando } from '../../componentes/comunes.tsx';
import { Microfono } from '../../componentes/Microfono.tsx';
import { nombreEspecie } from './comun.tsx';

type TipoInforme = 'valoracion' | 'evolucion' | 'alta';
const TIPOS: TipoInforme[] = ['valoracion', 'evolucion', 'alta'];

interface DatosInforme {
  resumen: string;
  hallazgos: string[];
  tratamiento_realizado: string[];
  evolucion: string;
  plan: string;
  recomendaciones_veterinario: string[];
  proxima_revision: string | null;
  dudas: string[];
  estado_al_alta: string | null;
  pautas_domicilio: string | null;
}
const LISTAS = ['hallazgos', 'tratamiento_realizado', 'recomendaciones_veterinario', 'dudas'] as const;
const TEXTOS = ['resumen', 'evolucion', 'plan'] as const;
const OPCIONALES = ['proxima_revision', 'estado_al_alta', 'pautas_domicilio'] as const;
const ORDEN: (keyof DatosInforme)[] = [
  'resumen', 'hallazgos', 'tratamiento_realizado', 'evolucion', 'plan', 'recomendaciones_veterinario',
  'proxima_revision', 'estado_al_alta', 'pautas_domicilio',
];

interface Propuesta {
  id: number;
  tipo: TipoInforme;
  estado: string;
  origen: string;
  datos: DatosInforme;
  sustituye_informe_id: number | null;
  creado: string;
}
interface Transcripcion {
  id: number;
  texto: string;
  error: string | null;
  tiene_audio: boolean;
  creado: string;
}
interface InformeLista {
  id: number;
  tipo: TipoInforme;
  creado: string;
  sustituye_id: number | null;
  autor: string | null;
}

const titulo = (tipo: TipoInforme) => t(`informes.titulo.${tipo}` as ClaveTexto);
const seccion = (k: keyof DatosInforme) => t(`informes.seccion.${k}` as ClaveTexto);
const mensajeError = (err: unknown) =>
  err instanceof ErrorApi && err.campos ? Object.values(err.campos).join(' ') : mensajeDe(err);

/** Las secciones de un informe, sin las dudas (son para el fisio). */
function Secciones({ tipo, datos }: { tipo: TipoInforme; datos: DatosInforme }) {
  return (
    <div className="informe-secciones">
      {ORDEN.filter((k) => tipo === 'alta' || (k !== 'estado_al_alta' && k !== 'pautas_domicilio')).map((k) => {
        const v = datos[k];
        if (v === null || v === '' || (Array.isArray(v) && v.length === 0)) return null;
        return (
          <section key={k}>
            <h3>{seccion(k)}</h3>
            {Array.isArray(v) ? <ul>{v.map((x, i) => <li key={i}>{x}</li>)}</ul> : <p className="texto-largo">{v}</p>}
          </section>
        );
      })}
    </div>
  );
}

export function Informes({ casoId, zona, estado }: { casoId: number; zona: '/d' | '/b'; estado: string }) {
  const [informes, setInformes] = useState<InformeLista[] | null>(null);
  const [error, setError] = useState('');
  const cargar = useCallback(async () => {
    const r = await api.get<{ informes: InformeLista[] }>(`/casos/${casoId}/informes`);
    setInformes(r.informes);
  }, [casoId]);
  useEffect(() => {
    cargar().catch((err) => setError(mensajeDe(err)));
  }, [cargar]);

  const admite = ['aceptada', 'en_tratamiento', 'alta', 'abandonada'].includes(estado);
  return (
    <div className="informes">
      {error ? <Aviso tipo="error">{error}</Aviso> : null}
      {zona === '/b' && admite ? <NuevoInforme casoId={casoId} alPublicar={() => void cargar()} /> : null}
      <section className="tarjeta">
        <h2>{t('informes.titulo')}</h2>
        {!informes ? <Cargando /> : informes.length === 0 ? <p className="texto-suave">{t('informes.ninguno')}</p> : (
          <ul className="lista">
            {informes.map((i) => (
              <li key={i.id}>
                <Link to={`${zona}/casos/${casoId}/informes/${i.id}`} className="fila-enlace">
                  <span className="icono-fila"><FileText size={18} aria-hidden /></span>
                  <div className="principal">
                    <strong>{titulo(i.tipo)}</strong>
                    <span>{[fecha(i.creado), i.autor].filter(Boolean).join(' · ')}</span>
                  </div>
                  {i.sustituye_id ? <span className="chip gris">{t('informes.corregir')}</span> : null}
                </Link>
              </li>
            ))}
          </ul>
        )}
      </section>
    </div>
  );
}

function NuevoInforme({ casoId, alPublicar }: { casoId: number; alPublicar: () => void }) {
  const [ia, setIa] = useState<{ redactor: boolean; transcriptor: boolean } | null>(null);
  const [tipo, setTipo] = useState<TipoInforme>('evolucion');
  const [notas, setNotas] = useState<Transcripcion[]>([]);
  const [elegidas, setElegidas] = useState<Set<number>>(new Set());
  const [transcribiendo, setTranscribiendo] = useState(false);
  const [instrucciones, setInstrucciones] = useState('');
  const [pendientes, setPendientes] = useState<Propuesta[]>([]);
  const [redactando, setRedactando] = useState(false);
  const [error, setError] = useState('');
  const [aviso, setAviso] = useState('');

  const cargar = useCallback(async () => {
    const [estadoIa, ts, ps] = await Promise.all([
      api.get<{ redactor: boolean; transcriptor: boolean }>('/ia/estado'),
      api.get<{ transcripciones: Transcripcion[] }>(`/casos/${casoId}/transcripciones`),
      api.get<{ propuestas: { id: number; estado: string }[] }>(`/casos/${casoId}/propuestas-informe`),
    ]);
    setIa(estadoIa);
    setNotas(ts.transcripciones);
    const abiertas = await Promise.all(
      ps.propuestas.filter((p) => p.estado === 'pendiente').map((p) => api.get<Propuesta>(`/propuestas-informe/${p.id}`)),
    );
    setPendientes(abiertas);
  }, [casoId]);
  useEffect(() => {
    cargar().catch((err) => setError(mensajeDe(err)));
  }, [cargar]);

  async function subirAudio(audio: Blob) {
    setTranscribiendo(true);
    setError('');
    try {
      const ext = audio.type.includes('mp4') ? 'm4a' : audio.type.includes('ogg') ? 'ogg' : 'webm';
      const nueva = await api.subir<Transcripcion>(`/casos/${casoId}/transcripciones`, audio, 'audio', {}, `nota.${ext}`);
      setNotas((n) => [...n, nueva]);
      setElegidas((e) => new Set(e).add(nueva.id));
    } catch (err) {
      setError(mensajeDe(err));
    } finally {
      setTranscribiendo(false);
    }
  }

  async function redactar(manual: boolean) {
    setRedactando(true);
    setError('');
    try {
      const p = await api.post<Propuesta>(`/casos/${casoId}/propuestas-informe`, {
        tipo, manual, instrucciones: instrucciones || undefined,
        transcripcion_ids: !manual && elegidas.size ? [...elegidas] : undefined,
      });
      setPendientes((ps) => [p, ...ps]);
      setInstrucciones('');
    } catch (err) {
      setError(mensajeError(err));
    } finally {
      setRedactando(false);
    }
  }

  if (!ia) return <Cargando />;
  return (
    <>
      {aviso ? <Aviso>{aviso}</Aviso> : null}
      {error ? <Aviso tipo="error">{error}</Aviso> : null}
      {pendientes.map((p) => (
        <PropuestaVista
          key={p.id}
          propuesta={p}
          puedeRegenerar={ia.redactor}
          alSustituir={(nueva) => setPendientes((ps) => ps.map((x) => (x.id === p.id ? nueva : x)))}
          alCerrar={(msg) => {
            setPendientes((ps) => ps.filter((x) => x.id !== p.id));
            if (msg) {
              setAviso(msg);
              alPublicar();
            }
          }}
        />
      ))}
      <section className="tarjeta">
        <h2>{t('informes.nuevo')}</h2>
        <div className="formulario">
          <CampoSelector etiqueta={t('informes.tipo')} value={tipo} onChange={(e) => setTipo(e.target.value as TipoInforme)}>
            {TIPOS.map((x) => <option key={x} value={x}>{t(`informes.tipo.${x}` as ClaveTexto)}</option>)}
          </CampoSelector>
          {ia.transcriptor ? (
            <div className="notas-voz">
              <h3>{t('informes.notas')}</h3>
              <p className="texto-suave">{t('informes.notasAyuda')}</p>
              {notas.length === 0 ? <p className="texto-suave">{t('informes.sinNotas')}</p> : null}
              {notas.map((n) => (
                <NotaVoz
                  key={n.id}
                  nota={n}
                  elegida={elegidas.has(n.id)}
                  alElegir={(si) => setElegidas((e) => {
                    const otra = new Set(e);
                    if (si) otra.add(n.id);
                    else otra.delete(n.id);
                    return otra;
                  })}
                  alCambiar={(x) => setNotas((ns) => ns.map((y) => (y.id === x.id ? x : y)))}
                />
              ))}
              {transcribiendo ? <p className="mensaje subiendo">{t('informes.transcribiendo')}</p> : null}
              <Microfono alTerminar={(a) => void subirAudio(a)} desactivado={transcribiendo} />
            </div>
          ) : null}
          {ia.redactor ? (
            <Campo etiqueta={t('informes.instrucciones')} value={instrucciones} onChange={(e) => setInstrucciones(e.target.value)} />
          ) : null}
          {tipo === 'alta' ? <Aviso tipo="info">{t('informes.altaAviso')}</Aviso> : null}
          <div className="acciones">
            {ia.redactor ? (
              <button type="button" className="boton" disabled={redactando} onClick={() => void redactar(false)}>
                <Sparkles size={18} aria-hidden /> {redactando ? t('informes.redactando') : t('informes.redactarIa')}
              </button>
            ) : null}
            <button type="button" className="boton-secundario" disabled={redactando} onClick={() => void redactar(true)}>
              <PenLine size={18} aria-hidden /> {t('informes.redactarMano')}
            </button>
          </div>
        </div>
      </section>
    </>
  );
}

function NotaVoz({ nota, elegida, alElegir, alCambiar }: {
  nota: Transcripcion;
  elegida: boolean;
  alElegir: (si: boolean) => void;
  alCambiar: (n: Transcripcion) => void;
}) {
  const [texto, setTexto] = useState(nota.texto);
  const [error, setError] = useState('');
  return (
    <div className="nota-voz">
      <label className="casilla">
        <input type="checkbox" checked={elegida} onChange={(e) => alElegir(e.target.checked)} />
        <span>{fecha(nota.creado)}</span>
      </label>
      {nota.error ? <Aviso tipo="atencion">{nota.error}</Aviso> : null}
      <CampoTexto etiqueta={t('informes.notas')} className="sin-etiqueta" rows={3} value={texto} onChange={(e) => setTexto(e.target.value)} />
      {error ? <p className="error-campo">{error}</p> : null}
      <div className="acciones">
        {texto !== nota.texto ? (
          <button type="button" className="boton-secundario" onClick={async () => {
            try {
              alCambiar(await api.patch<Transcripcion>(`/transcripciones/${nota.id}`, { texto }));
            } catch (err) {
              setError(mensajeDe(err));
            }
          }}>{t('informes.guardarTexto')}</button>
        ) : null}
        {nota.error && nota.tiene_audio ? (
          <button type="button" className="boton-texto" onClick={async () => {
            try {
              const n = await api.post<Transcripcion>(`/transcripciones/${nota.id}/reintenta`);
              setTexto(n.texto);
              alCambiar(n);
            } catch (err) {
              setError(mensajeDe(err));
            }
          }}><RefreshCw size={16} aria-hidden /> {t('informes.reintentar')}</button>
        ) : null}
      </div>
    </div>
  );
}

function PropuestaVista({ propuesta, puedeRegenerar, alSustituir, alCerrar }: {
  propuesta: Propuesta;
  puedeRegenerar: boolean;
  alSustituir: (p: Propuesta) => void;
  alCerrar: (aviso?: string) => void;
}) {
  const [editando, setEditando] = useState(false);
  const [instrucciones, setInstrucciones] = useState('');
  const [trabajando, setTrabajando] = useState(false);
  const [error, setError] = useState('');

  async function hacer(accion: () => Promise<void>) {
    setTrabajando(true);
    setError('');
    try {
      await accion();
    } catch (err) {
      setError(mensajeError(err));
    } finally {
      setTrabajando(false);
    }
  }

  if (editando) {
    return (
      <EditorInforme
        tipo={propuesta.tipo}
        datos={propuesta.datos}
        alCancelar={() => setEditando(false)}
        alGuardar={(datos) => hacer(async () => {
          alSustituir(await api.post<Propuesta>(`/propuestas-informe/${propuesta.id}/edita`, { datos }));
          setEditando(false);
        })}
        error={error}
      />
    );
  }
  return (
    <section className="tarjeta propuesta">
      <div className="cabecera-seccion">
        <h2>{t('informes.propuesta')} · {titulo(propuesta.tipo)}</h2>
        <span className="chip atencion">{t('informes.pendientes')}</span>
      </div>
      {propuesta.datos.dudas.length ? (
        <div className="dudas">
          <strong><AlertTriangle size={16} aria-hidden /> {t('informes.dudas')}</strong>
          <ul>{propuesta.datos.dudas.map((d, i) => <li key={i}>{d}</li>)}</ul>
        </div>
      ) : null}
      <Secciones tipo={propuesta.tipo} datos={propuesta.datos} />
      {error ? <Aviso tipo="error">{error}</Aviso> : null}
      {puedeRegenerar ? (
        <Campo etiqueta={t('informes.instrucciones')} value={instrucciones} onChange={(e) => setInstrucciones(e.target.value)} />
      ) : null}
      <div className="acciones">
        <button type="button" className="boton" disabled={trabajando} onClick={() => {
          if (!window.confirm(t('informes.confirmarSeguro'))) return;
          void hacer(async () => {
            await api.post(`/propuestas-informe/${propuesta.id}/confirma`);
            alCerrar(t('informes.confirmado'));
          });
        }}><Check size={18} aria-hidden /> {t('informes.confirmar')}</button>
        <button type="button" className="boton-secundario" disabled={trabajando} onClick={() => setEditando(true)}>
          <PenLine size={18} aria-hidden /> {t('informes.editar')}
        </button>
        {puedeRegenerar ? (
          <button type="button" className="boton-secundario" disabled={trabajando} onClick={() => void hacer(async () => {
            alSustituir(await api.post<Propuesta>(`/propuestas-informe/${propuesta.id}/regenera`, { instrucciones: instrucciones || undefined }));
            setInstrucciones('');
          })}><RefreshCw size={18} aria-hidden /> {trabajando ? t('informes.redactando') : t('informes.regenerar')}</button>
        ) : null}
        <button type="button" className="boton-texto" disabled={trabajando} onClick={() => void hacer(async () => {
          await api.post(`/propuestas-informe/${propuesta.id}/cancela`);
          alCerrar();
        })}><Trash2 size={16} aria-hidden /> {t('informes.cancelar')}</button>
      </div>
    </section>
  );
}

function EditorInforme({ tipo, datos, alGuardar, alCancelar, error }: {
  tipo: TipoInforme;
  datos: DatosInforme;
  alGuardar: (d: DatosInforme) => void;
  alCancelar: () => void;
  error: string;
}) {
  const [d, setD] = useState(datos);
  const [listas, setListas] = useState(() => Object.fromEntries(LISTAS.map((k) => [k, datos[k].join('\n')])) as Record<(typeof LISTAS)[number], string>);
  const guardar = () => alGuardar({
    ...d,
    ...Object.fromEntries(LISTAS.map((k) => [k, listas[k].split('\n').map((x) => x.trim()).filter(Boolean)])),
  } as DatosInforme);
  return (
    <section className="tarjeta">
      <h2>{t('informes.editar')} · {titulo(tipo)}</h2>
      {error ? <Aviso tipo="error">{error}</Aviso> : null}
      <div className="formulario">
        {TEXTOS.map((k) => (
          <CampoTexto key={k} etiqueta={seccion(k)} rows={k === 'resumen' ? 3 : 4} value={d[k]} onChange={(e) => setD({ ...d, [k]: e.target.value })} />
        ))}
        {LISTAS.map((k) => (
          <CampoTexto key={k} etiqueta={seccion(k)} ayuda={t('informes.unoPorLinea')} rows={4} value={listas[k]}
            onChange={(e) => setListas({ ...listas, [k]: e.target.value })} />
        ))}
        {OPCIONALES.filter((k) => tipo === 'alta' || k === 'proxima_revision').map((k) => (
          <CampoTexto key={k} etiqueta={seccion(k)} rows={2} value={d[k] ?? ''}
            onChange={(e) => setD({ ...d, [k]: e.target.value.trim() ? e.target.value : null })} />
        ))}
      </div>
      <div className="acciones">
        <button type="button" className="boton" onClick={guardar}><Check size={18} aria-hidden /> {t('caso.guardar')}</button>
        <button type="button" className="boton-texto" onClick={alCancelar}><X size={16} aria-hidden /> {t('caso.cancelar')}</button>
      </div>
    </section>
  );
}

interface InformeCompleto {
  id: number;
  tipo: TipoInforme;
  contenido: DatosInforme;
  creado: string;
  sustituye_id: number | null;
  caso_id: number;
  autor: string | null;
  paciente: string;
  especie: string | null;
  especie_otra: string | null;
  raza: string | null;
  clinica: string;
  veterinario: string | null;
}

/** La vista de un informe: la que se imprime. */
export function InformeVista({ zona }: { zona: '/d' | '/b' }) {
  const { id, iid } = useParams();
  const navegar = useNavigate();
  const { usuario } = useSesion();
  const [informe, setInforme] = useState<InformeCompleto | null>(null);
  const [error, setError] = useState('');
  useEffect(() => {
    api.get<InformeCompleto>(`/informes/${iid}`).then(setInforme).catch((err) => setError(mensajeDe(err)));
  }, [iid]);
  if (error) return <Aviso tipo="error">{error}</Aviso>;
  if (!informe) return <Cargando />;
  const bambu = usuario?.rol === 'bambu' || usuario?.rol === 'superadmin';
  return (
    <article className="informe-imprimible">
      <div className="no-imprimir acciones">
        <Link to={`${zona}/casos/${id}?p=informes`} className="volver"><ArrowLeft size={16} aria-hidden /> {t('caso.volver')}</Link>
        <button type="button" className="boton-secundario" onClick={() => window.print()}><Printer size={18} aria-hidden /> {t('informes.imprimir')}</button>
        {bambu ? (
          <button type="button" className="boton-texto" onClick={async () => {
            try {
              await api.post(`/casos/${informe.caso_id}/propuestas-informe`, {
                tipo: informe.tipo, manual: true, datos: informe.contenido, sustituye_informe_id: informe.id,
              });
              navegar(`/b/casos/${informe.caso_id}?p=informes`);
            } catch (err) {
              setError(mensajeDe(err));
            }
          }}><PenLine size={16} aria-hidden /> {t('informes.corregir')}</button>
        ) : null}
      </div>
      <header className="informe-cabecera">
        <img src="/logo-bambu.png" alt="BAMBÚ Fisiovet" width={64} height={64} />
        <div>
          <h1>{titulo(informe.tipo)}</h1>
          <p className="texto-suave">BAMBÚ Fisiovet</p>
        </div>
      </header>
      <dl className="datos">
        <div><dt>{t('informes.paciente')}</dt><dd>{informe.paciente} · {nombreEspecie(informe.especie, informe.especie_otra)}{informe.raza ? ` · ${informe.raza}` : ''}</dd></div>
        <div><dt>{t('caso.clinica')}</dt><dd>{informe.clinica}</dd></div>
        {informe.veterinario ? <div><dt>{t('informes.veterinario')}</dt><dd>{informe.veterinario}</dd></div> : null}
        <div><dt>{t('informes.fisio')}</dt><dd>{informe.autor}</dd></div>
        <div><dt>{t('informes.fecha')}</dt><dd>{fecha(informe.creado)}</dd></div>
      </dl>
      {informe.sustituye_id ? <p className="chip gris">{t('informes.corregir')}</p> : null}
      <Secciones tipo={informe.tipo} datos={informe.contenido} />
    </article>
  );
}
