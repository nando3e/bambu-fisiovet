// «Nova derivació» del veterinario: tres pasos, con borrador que se guarda
// solo. El segundo pide solo el motivo y el tratamiento actual, y deja subir
// los documentos (radiografies, informes, analítiques) desde el borrador: van
// subiendo en fila mientras se escribe y «Envia» espera a que acaben. Bambú
// no registra derivaciones: el portal solo las recibe.
import { useCallback, useEffect, useRef, useState } from 'react';
import { Link, useNavigate, useSearchParams } from 'react-router';
import { ArrowLeft, ArrowRight, Check, Loader2, Search, Send, Trash2 } from 'lucide-react';
import { api, ErrorApi, mensajeDe } from '../../api.ts';
import { t, type ClaveTexto } from '../../i18n/index.ts';
import { Aviso, Cargando, TituloPagina } from '../../componentes/comunes.tsx';
import {
  CamposDerivacion, CamposPaciente, CamposPropietario, DERIVACION_VACIA, PACIENTE_VACIO, PROPIETARIO_VACIO,
  pacienteParaApi,
} from './Formularios.tsx';
import { nombreEspecie, type CasoLista, type DatosDerivacion, type DatosPaciente, type DatosPropietario, type Ficha } from './comun.tsx';
import { Documentos } from './Documentos.tsx';
import { useSubidas } from '../../subidas.ts';

type Errores = Record<string, string>;

interface PacienteBuscado {
  id: number;
  nombre: string;
  especie: string | null;
  especie_otra: string | null;
  propietario: string;
  telefono: string | null;
}

const PASOS: ClaveTexto[] = ['nova.paso1', 'nova.paso2', 'nova.paso3'];

/** En qué paso está cada campo, para saltar al primero que falla. */
function pasoDelError(campos: Errores): number {
  const claves = Object.keys(campos);
  if (claves.some((c) => c.startsWith('paciente') || c.startsWith('propietario'))) return 0;
  if (claves.some((c) => c.startsWith('caso'))) return 1;
  return 2;
}

export function NovaDerivacion() {
  const navegar = useNavigate();
  const [url, setUrl] = useSearchParams();
  const casoUrl = Number(url.get('cas')) || null;

  const [cargando, setCargando] = useState(true);
  const [borradorPendiente, setBorradorPendiente] = useState<CasoLista | null>(null);
  const [casoId, setCasoId] = useState<number | null>(null);
  const [paso, setPaso] = useState(0);
  const [paciente, setPaciente] = useState<DatosPaciente>(PACIENTE_VACIO);
  const [propietario, setPropietario] = useState<DatosPropietario>(PROPIETARIO_VACIO);
  const [derivacion, setDerivacion] = useState<DatosDerivacion>(DERIVACION_VACIA);
  const [existente, setExistente] = useState<{ id: number; nombre: string } | null>(null);
  const [consentimiento, setConsentimiento] = useState<{ texto: string; version: number } | null>(null);
  const [yaConsentido, setYaConsentido] = useState(false);
  const [acepta, setAcepta] = useState(false);
  const [errores, setErrores] = useState<Errores>({});
  const [error, setError] = useState('');
  const [guardado, setGuardado] = useState<'nada' | 'guardando' | 'guardado'>('nada');
  const [enviando, setEnviando] = useState(false);
  const subidas = useSubidas();

  useEffect(() => {
    api.get<{ texto: string; version: number }>('/consentimiento').then(setConsentimiento).catch(() => {});
  }, []);

  // El borrador que se acaba de crear aquí no se recarga: la respuesta llegaría
  // tarde y pisaría lo que ya se está escribiendo en el paso siguiente.
  const creadoAqui = useRef<number | null>(null);

  // Retomar el borrador de la URL, u ofrecer el que tenga a medias.
  useEffect(() => {
    if (casoUrl !== null && casoUrl === creadoAqui.current) return;
    setCargando(true);
    const cargar = casoUrl
      ? api.get<Ficha>(`/casos/${casoUrl}`).then((f) => {
        if (f.estado !== 'borrador') {
          navegar(`/d/casos/${f.id}`, { replace: true });
          return;
        }
        setCasoId(f.id);
        setPaciente(f.paciente);
        setPropietario(f.propietario);
        setDerivacion(f);
        setYaConsentido(f.consentimiento_vigente);
        setBorradorPendiente(null);
      })
      : api.get<{ casos: CasoLista[] }>('/casos?estado=borrador').then((r) => setBorradorPendiente(r.casos[0] ?? null));
    cargar.catch((err) => setError(mensajeDe(err))).finally(() => setCargando(false));
  }, [casoUrl, navegar]);

  // Autoguardado del borrador: 800 ms después de dejar de escribir. Los
  // guardados van en fila (uno detrás de otro), para que una respuesta lenta
  // no deje en el servidor una versión anterior, y «Envia» guarda lo último
  // antes de enviar.
  const primeraVez = useRef(true);
  const fila = useRef<Promise<unknown>>(Promise.resolve());
  const pendiente = useRef<ReturnType<typeof setTimeout> | null>(null);
  const guardarAhora = useCallback(() => {
    if (!casoId) return Promise.resolve();
    const cuerpo = existente
      ? { caso: derivacion }
      : { paciente: pacienteParaApi(paciente), propietario, caso: derivacion };
    setGuardado('guardando');
    const vuelta = fila.current.catch(() => {}).then(() => api.patch(`/casos/${casoId}`, cuerpo));
    fila.current = vuelta;
    return vuelta.then(() => {
      setGuardado('guardado');
      setErrores({});
    });
  }, [casoId, existente, derivacion, paciente, propietario]);

  useEffect(() => {
    if (!casoId) return;
    if (primeraVez.current) {
      primeraVez.current = false;
      return;
    }
    setGuardado('guardando');
    pendiente.current = setTimeout(() => {
      pendiente.current = null;
      guardarAhora().catch((err) => {
        setGuardado('nada');
        if (err instanceof ErrorApi && err.campos) setErrores(err.campos);
        else setError(mensajeDe(err));
      });
    }, 800);
    return () => {
      if (pendiente.current) clearTimeout(pendiente.current);
      pendiente.current = null;
    };
  }, [casoId, guardarAhora]);

  const crearBorrador = useCallback(async () => {
    const r = await api.post<Ficha>('/casos', existente
      ? { paciente_id: existente.id, caso: derivacion }
      : { paciente: pacienteParaApi(paciente), propietario, caso: derivacion });
    primeraVez.current = true;
    creadoAqui.current = r.id;
    setCasoId(r.id);
    setYaConsentido(r.consentimiento_vigente);
    setUrl({ cas: String(r.id) }, { replace: true });
  }, [existente, derivacion, paciente, propietario, setUrl]);

  async function siguiente() {
    setError('');
    try {
      if (paso === 0 && !casoId) await crearBorrador();
      setPaso((p) => p + 1);
      window.scrollTo({ top: 0 });
    } catch (err) {
      if (err instanceof ErrorApi && err.campos) setErrores(err.campos);
      setError(mensajeDe(err));
    }
  }

  async function terminar() {
    setError('');
    setEnviando(true);
    try {
      // Lo último que se ha escrito, guardado antes de enviar.
      if (pendiente.current) clearTimeout(pendiente.current);
      pendiente.current = null;
      await guardarAhora();
      // Los documentos que aún suben: la derivación sale con todos.
      await subidas.esperar();
      await api.post(`/casos/${casoId}/envia`, { acepta_consentimiento: acepta });
      navegar(`/d/casos/${casoId}`, { replace: true, state: { aviso: t('nova.enviada') } });
    } catch (err) {
      if (err instanceof ErrorApi && err.campos) {
        setErrores(err.campos);
        setPaso(pasoDelError(err.campos));
        setError(t('nova.faltan'));
      } else {
        setError(mensajeDe(err));
      }
    } finally {
      setEnviando(false);
    }
  }

  async function descartar() {
    if (!casoId) return;
    try {
      await api.post(`/casos/${casoId}/descarta`);
      navegar('/d', { replace: true });
    } catch (err) {
      setError(mensajeDe(err));
    }
  }

  if (cargando) return <Cargando />;

  if (borradorPendiente && !casoUrl) {
    return (
      <>
        <TituloPagina titulo={t('nova.titulo')} />
        <section className="tarjeta">
          <p>{t('nova.borradorPendiente', { paciente: borradorPendiente.paciente || '—' })}</p>
          <div className="acciones">
            <button type="button" className="boton" onClick={() => setUrl({ cas: String(borradorPendiente.id) })}>
              {t('nova.continuar')}
            </button>
            <button type="button" className="boton-secundario" onClick={() => setBorradorPendiente(null)}>
              {t('nova.empezarNueva')}
            </button>
          </div>
        </section>
      </>
    );
  }

  const ultimo = paso === PASOS.length - 1;
  return (
    <>
      <TituloPagina titulo={t('nova.titulo')} subtitulo={t('nova.subtitulo')} ayuda="ayuda.novaD" />
      <div className="pasos" aria-label={t('nova.paso', { n: paso + 1, total: PASOS.length })}>
        {PASOS.map((p, i) => (
          <span key={p} className={i === paso ? 'activo' : i < paso ? 'hecho' : undefined}>
            <b>{i < paso ? <Check size={14} aria-hidden /> : i + 1}</b> {t(p)}
          </span>
        ))}
      </div>
      {casoId ? (
        <p className="estado-guardado" role="status">
          {guardado === 'guardando' ? <><Loader2 className="girando" size={14} aria-hidden /> {t('nova.desando')}</>
            : guardado === 'guardado' ? <><Check size={14} aria-hidden /> {t('nova.desado')}</> : null}
        </p>
      ) : null}
      {error ? <Aviso tipo="error">{error}</Aviso> : null}

      <section className="tarjeta">
        {paso === 0 ? (
          <>
            <BuscarPaciente
              existente={existente}
              bloqueado={Boolean(casoId)}
              elegir={async (p) => {
                setExistente(p ? { id: p.id, nombre: p.nombre } : null);
                if (!p) {
                  setPaciente(PACIENTE_VACIO);
                  setPropietario(PROPIETARIO_VACIO);
                  return;
                }
                const ficha = await api.get<DatosPaciente & { propietario: DatosPropietario }>(`/pacientes/${p.id}`);
                setPaciente(ficha);
                setPropietario(ficha.propietario);
              }}
            />
            <h2>{t('caso.paciente')}</h2>
            <CamposPaciente valor={paciente} cambiar={setPaciente} errores={errores} bloqueado={Boolean(existente)} />
            <h2>{t('caso.propietario')}</h2>
            <CamposPropietario valor={propietario} cambiar={setPropietario} errores={errores} bloqueado={Boolean(existente)} />
          </>
        ) : null}

        {paso === 1 ? (
          <>
            <CamposDerivacion valor={derivacion} cambiar={setDerivacion} errores={errores} />
            {casoId ? <Documentos casoId={casoId} estado="borrador" deriva subidas={subidas} enFormulario /> : null}
          </>
        ) : null}

        {ultimo ? (
          <>
            <h2>{t('caso.consentimiento')}</h2>
            {consentimiento ? <p className="texto-consentimiento">{consentimiento.texto}</p> : null}
            {yaConsentido ? <Aviso tipo="info">{t('nova.consentimientoYaDado')}</Aviso> : (
              <label className="casilla">
                <input type="checkbox" checked={acepta} onChange={(e) => setAcepta(e.target.checked)} />
                <span>{t('nova.consentimientoAcepto')}</span>
              </label>
            )}
            {errores.consentimiento ? <p className="error-campo">{errores.consentimiento}</p> : null}
          </>
        ) : null}
      </section>

      <div className="acciones">
        {paso > 0 ? (
          <button type="button" className="boton-secundario" onClick={() => setPaso((p) => p - 1)}>
            <ArrowLeft size={18} aria-hidden /> {t('nova.anterior')}
          </button>
        ) : (
          <Link to="/d" className="boton-texto"><ArrowLeft size={18} aria-hidden /> {t('caso.volver')}</Link>
        )}
        {ultimo ? (
          <button type="button" className="boton" disabled={enviando} onClick={() => void terminar()}>
            {enviando && subidas.enCurso.length > 0 ? <Loader2 className="girando" size={18} aria-hidden /> : <Send size={18} aria-hidden />}
            {' '}{enviando && subidas.enCurso.length > 0 ? t('doc.esperando') : t('nova.enviar')}
          </button>
        ) : (
          <button type="button" className="boton" onClick={() => void siguiente()}>
            {t('nova.siguiente')} <ArrowRight size={18} aria-hidden />
          </button>
        )}
      </div>
      {casoId ? (
        <div className="acciones">
          <button type="button" className="boton-texto" onClick={() => void descartar()}>
            <Trash2 size={16} aria-hidden /> {t('nova.descartar')}
          </button>
        </div>
      ) : null}
    </>
  );
}

function BuscarPaciente({ existente, bloqueado, elegir }: {
  existente: { id: number; nombre: string } | null;
  bloqueado: boolean;
  elegir: (p: PacienteBuscado | null) => Promise<void>;
}) {
  const [texto, setTexto] = useState('');
  const [resultados, setResultados] = useState<PacienteBuscado[]>([]);
  useEffect(() => {
    if (texto.trim().length < 2) {
      setResultados([]);
      return;
    }
    const espera = setTimeout(() => {
      const p = new URLSearchParams({ q: texto.trim() });
      api.get<{ pacientes: PacienteBuscado[] }>(`/pacientes?${p.toString()}`).then((r) => setResultados(r.pacientes)).catch(() => {});
    }, 300);
    return () => clearTimeout(espera);
  }, [texto]);

  if (existente) {
    return (
      <Aviso tipo="info">
        {t('nova.pacienteExistente', { nombre: existente.nombre })}{' '}
        {!bloqueado ? <button type="button" className="boton-texto" onClick={() => void elegir(null)}>{t('nova.otroPaciente')}</button> : null}
      </Aviso>
    );
  }
  if (bloqueado) return null;
  return (
    <div className="buscar-paciente">
      <label className="campo buscador">
        <span>{t('nova.buscarPaciente')}</span>
        <Search size={18} aria-hidden />
        <input type="search" value={texto} placeholder={t('nova.buscarPacienteAyuda')} onChange={(e) => setTexto(e.target.value)} />
      </label>
      {resultados.length > 0 ? (
        <ul className="lista">
          {resultados.map((p) => (
            <li key={p.id}>
              <button type="button" className="fila-enlace" onClick={() => { setTexto(''); void elegir(p); }}>
                <div className="principal">
                  <strong>{p.nombre} · {nombreEspecie(p.especie, p.especie_otra)}</strong>
                  <span>{[p.propietario, p.telefono].filter(Boolean).join(' · ')}</span>
                </div>
              </button>
            </li>
          ))}
        </ul>
      ) : null}
    </div>
  );
}
