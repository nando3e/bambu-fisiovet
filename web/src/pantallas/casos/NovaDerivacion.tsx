// «Nova derivació» del veterinario (tres pasos, con borrador que se guarda
// solo) y «Registra una derivació» de Bambú (las que llegan por teléfono o
// correo: un paso más para la clínica, sin borrador, nace aceptada).
import { useCallback, useEffect, useRef, useState } from 'react';
import { Link, useNavigate, useSearchParams } from 'react-router';
import { ArrowLeft, ArrowRight, Check, Loader2, Plus, Search, Send, Trash2 } from 'lucide-react';
import { api, ErrorApi, mensajeDe } from '../../api.ts';
import { t, type ClaveTexto } from '../../i18n/index.ts';
import { Aviso, Campo, CampoSelector, Cargando, TituloPagina } from '../../componentes/comunes.tsx';
import {
  CamposDerivacion, CamposPaciente, CamposPropietario, DERIVACION_VACIA, PACIENTE_VACIO, PROPIETARIO_VACIO,
  pacienteParaApi,
} from './Formularios.tsx';
import { nombreEspecie, type CasoLista, type DatosDerivacion, type DatosPaciente, type DatosPropietario, type Ficha } from './comun.tsx';

type Errores = Record<string, string>;

interface PacienteBuscado {
  id: number;
  nombre: string;
  especie: string | null;
  especie_otra: string | null;
  propietario: string;
  telefono: string | null;
}

/** En qué paso está cada campo, para saltar al primero que falla. */
function pasoDelError(campos: Errores, conClinica: boolean): number {
  const base = conClinica ? 1 : 0;
  const claves = Object.keys(campos);
  if (claves.some((c) => c.startsWith('clinica') || c.startsWith('derivador') || c === 'fisio_id')) return 0;
  if (claves.some((c) => c.startsWith('paciente') || c.startsWith('propietario'))) return base;
  if (claves.some((c) => c.startsWith('caso'))) return base + 1;
  return base + 2;
}

export function NovaDerivacion({ modo }: { modo: 'derivador' | 'bambu' }) {
  const bambu = modo === 'bambu';
  const navegar = useNavigate();
  const [url, setUrl] = useSearchParams();
  const casoUrl = Number(url.get('cas')) || null;

  const [cargando, setCargando] = useState(!bambu);
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
  // Solo Bambú.
  const [clinica, setClinica] = useState<{ id: number; nombre: string } | null>(null);
  const [derivadorId, setDerivadorId] = useState<number | null>(null);
  const [derivadorNombre, setDerivadorNombre] = useState('');
  const [fisioId, setFisioId] = useState<number | null>(null);
  const [cita, setCita] = useState(false);
  const [primeraVisita, setPrimeraVisita] = useState('');

  const pasos: ClaveTexto[] = bambu
    ? ['nova.pasoClinica', 'nova.paso1', 'nova.paso2', 'nova.paso3']
    : ['nova.paso1', 'nova.paso2', 'nova.paso3'];
  const pasoPaciente = bambu ? 1 : 0;

  useEffect(() => {
    api.get<{ texto: string; version: number }>('/consentimiento').then(setConsentimiento).catch(() => {});
  }, []);

  // El borrador que se acaba de crear aquí no se recarga: la respuesta llegaría
  // tarde y pisaría lo que ya se está escribiendo en el paso siguiente.
  const creadoAqui = useRef<number | null>(null);

  // El veterinario: retomar el borrador de la URL, u ofrecer el que tenga a medias.
  useEffect(() => {
    if (bambu) return;
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
  }, [bambu, casoUrl, navegar]);

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
    if (bambu || !casoId) return;
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
  }, [bambu, casoId, guardarAhora]);

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
      if (!bambu && paso === 0 && !casoId) await crearBorrador();
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
      if (bambu) {
        const r = await api.post<Ficha>('/casos', {
          ...(existente ? { paciente_id: existente.id } : { paciente: pacienteParaApi(paciente), propietario }),
          caso: derivacion,
          clinica_id: clinica?.id,
          derivador_id: derivadorId,
          derivador_nombre: derivadorId ? '' : derivadorNombre,
          fisio_id: fisioId,
          ja_te_cita: cita,
          primera_visita: cita && primeraVisita ? primeraVisita : null,
          acepta_consentimiento: acepta,
        });
        navegar(`/b/casos/${r.id}`, { replace: true });
        return;
      }
      // Lo último que se ha escrito, guardado antes de enviar.
      if (pendiente.current) clearTimeout(pendiente.current);
      pendiente.current = null;
      await guardarAhora();
      await api.post(`/casos/${casoId}/envia`, { acepta_consentimiento: acepta });
      navegar(`/d/casos/${casoId}`, { replace: true, state: { aviso: t('nova.enviada') } });
    } catch (err) {
      if (err instanceof ErrorApi && err.campos) {
        setErrores(err.campos);
        setPaso(pasoDelError(err.campos, bambu));
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

  const ultimo = paso === pasos.length - 1;
  return (
    <>
      <TituloPagina
        titulo={bambu ? t('nova.registraTitulo') : t('nova.titulo')}
        subtitulo={bambu ? t('nova.registraSubtitulo') : t('nova.subtitulo')}
        ayuda={bambu ? 'ayuda.novaB' : 'ayuda.novaD'}
      />
      <div className="pasos" aria-label={t('nova.paso', { n: paso + 1, total: pasos.length })}>
        {pasos.map((p, i) => (
          <span key={p} className={i === paso ? 'activo' : i < paso ? 'hecho' : undefined}>
            <b>{i < paso ? <Check size={14} aria-hidden /> : i + 1}</b> {t(p)}
          </span>
        ))}
      </div>
      {!bambu && casoId ? (
        <p className="estado-guardado" role="status">
          {guardado === 'guardando' ? <><Loader2 className="girando" size={14} aria-hidden /> {t('nova.desando')}</>
            : guardado === 'guardado' ? <><Check size={14} aria-hidden /> {t('nova.desado')}</> : null}
        </p>
      ) : null}
      {error ? <Aviso tipo="error">{error}</Aviso> : null}

      <section className="tarjeta">
        {bambu && paso === 0 ? (
          <PasoClinica
            clinica={clinica} setClinica={(c) => { setClinica(c); setDerivadorId(null); setExistente(null); }}
            derivadorId={derivadorId} setDerivadorId={setDerivadorId}
            derivadorNombre={derivadorNombre} setDerivadorNombre={setDerivadorNombre}
            fisioId={fisioId} setFisioId={setFisioId}
            cita={cita} setCita={setCita} primeraVisita={primeraVisita} setPrimeraVisita={setPrimeraVisita}
            errores={errores}
          />
        ) : null}

        {paso === pasoPaciente ? (
          <>
            {(!bambu || clinica) ? (
              <BuscarPaciente
                clinicaId={bambu ? clinica?.id ?? null : null}
                existente={existente}
                bloqueado={!bambu && Boolean(casoId)}
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
            ) : null}
            <h2>{t('caso.paciente')}</h2>
            <CamposPaciente valor={paciente} cambiar={setPaciente} errores={errores} bloqueado={Boolean(existente)} />
            <h2>{t('caso.propietario')}</h2>
            <CamposPropietario valor={propietario} cambiar={setPropietario} errores={errores} bloqueado={Boolean(existente)} />
          </>
        ) : null}

        {paso === pasoPaciente + 1 ? <CamposDerivacion valor={derivacion} cambiar={setDerivacion} errores={errores} /> : null}

        {ultimo ? (
          <>
            <h2>{t('caso.consentimiento')}</h2>
            {consentimiento ? <p className="texto-consentimiento">{consentimiento.texto}</p> : null}
            {yaConsentido && !bambu ? <Aviso tipo="info">{t('nova.consentimientoYaDado')}</Aviso> : (
              <label className="casilla">
                <input type="checkbox" checked={acepta} onChange={(e) => setAcepta(e.target.checked)} />
                <span>{bambu ? t('nova.consentimientoFisio') : t('nova.consentimientoAcepto')}</span>
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
          <Link to={bambu ? '/b/casos' : '/d'} className="boton-texto"><ArrowLeft size={18} aria-hidden /> {t('caso.volver')}</Link>
        )}
        {ultimo ? (
          <button type="button" className="boton" disabled={enviando || (bambu && !clinica)} onClick={() => void terminar()}>
            <Send size={18} aria-hidden /> {bambu ? t('nova.registrar') : t('nova.enviar')}
          </button>
        ) : (
          <button type="button" className="boton" disabled={bambu && paso === 0 && !clinica} onClick={() => void siguiente()}>
            {t('nova.siguiente')} <ArrowRight size={18} aria-hidden />
          </button>
        )}
      </div>
      {!bambu && casoId ? (
        <div className="acciones">
          <button type="button" className="boton-texto" onClick={() => void descartar()}>
            <Trash2 size={16} aria-hidden /> {t('nova.descartar')}
          </button>
        </div>
      ) : null}
    </>
  );
}

function BuscarPaciente({ clinicaId, existente, bloqueado, elegir }: {
  clinicaId: number | null;
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
      if (clinicaId) p.set('clinica_id', String(clinicaId));
      api.get<{ pacientes: PacienteBuscado[] }>(`/pacientes?${p.toString()}`).then((r) => setResultados(r.pacientes)).catch(() => {});
    }, 300);
    return () => clearTimeout(espera);
  }, [texto, clinicaId]);

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

interface ClinicaValidada { id: number; nombre: string; poblacion: string | null; validada: boolean }
interface Persona { id: number; nombre: string; apellidos: string; activo: boolean; verificado?: boolean; estado?: string; rol?: string }

function PasoClinica(p: {
  clinica: { id: number; nombre: string } | null;
  setClinica: (c: { id: number; nombre: string } | null) => void;
  derivadorId: number | null;
  setDerivadorId: (id: number | null) => void;
  derivadorNombre: string;
  setDerivadorNombre: (n: string) => void;
  fisioId: number | null;
  setFisioId: (id: number | null) => void;
  cita: boolean;
  setCita: (v: boolean) => void;
  primeraVisita: string;
  setPrimeraVisita: (v: string) => void;
  errores: Errores;
}) {
  const [clinicas, setClinicas] = useState<ClinicaValidada[]>([]);
  const [veterinarios, setVeterinarios] = useState<Persona[]>([]);
  const [fisios, setFisios] = useState<Persona[]>([]);
  const [filtro, setFiltro] = useState('');
  const [nueva, setNueva] = useState<{ nombre: string; poblacion: string; telefono: string } | null>(null);
  const [aviso, setAviso] = useState('');
  const [error, setError] = useState('');

  const cargarClinicas = useCallback(async () => {
    const r = await api.get<{ clinicas: ClinicaValidada[] }>('/clinicas');
    setClinicas(r.clinicas.filter((c) => c.validada));
  }, []);
  useEffect(() => {
    cargarClinicas().catch((err) => setError(mensajeDe(err)));
    api.get<{ usuarios: Persona[] }>('/usuarios?rol=bambu')
      .then((r) => setFisios(r.usuarios.filter((u) => u.activo && u.estado === 'activo')))
      .catch(() => {});
  }, [cargarClinicas]);
  useEffect(() => {
    if (!p.clinica) {
      setVeterinarios([]);
      return;
    }
    api.get<{ usuarios: Persona[] }>(`/clinicas/${p.clinica.id}/usuarios`)
      .then((r) => setVeterinarios(r.usuarios.filter((u) => u.activo && u.verificado)))
      .catch(() => setVeterinarios([]));
  }, [p.clinica]);

  async function crear() {
    if (!nueva) return;
    setError('');
    try {
      const c = await api.post<{ id: number; nombre: string }>('/clinicas', nueva);
      await cargarClinicas();
      p.setClinica(c);
      setNueva(null);
      setAviso(t('nova.clinicaCreada'));
    } catch (err) {
      setError(mensajeDe(err));
    }
  }

  const visibles = clinicas.filter((c) => !filtro || `${c.nombre} ${c.poblacion ?? ''}`.toLowerCase().includes(filtro.toLowerCase()));
  return (
    <>
      {aviso ? <Aviso>{aviso}</Aviso> : null}
      {error ? <Aviso tipo="error">{error}</Aviso> : null}
      <div className="formulario">
        {p.clinica ? (
          <Aviso tipo="info">
            <strong>{p.clinica.nombre}</strong>{' '}
            <button type="button" className="boton-texto" onClick={() => p.setClinica(null)}>{t('caso.cancelar')}</button>
          </Aviso>
        ) : (
          <>
            <label className="campo buscador">
              <span>{t('nova.clinica')}</span>
              <Search size={18} aria-hidden />
              <input type="search" value={filtro} onChange={(e) => setFiltro(e.target.value)} />
              <small>{t('nova.clinicaAyuda')}</small>
            </label>
            {p.errores.clinica_id ? <p className="error-campo">{p.errores.clinica_id}</p> : null}
            <ul className="lista lista-corta">
              {visibles.slice(0, 8).map((c) => (
                <li key={c.id}>
                  <button type="button" className="fila-enlace" onClick={() => p.setClinica({ id: c.id, nombre: c.nombre })}>
                    <div className="principal"><strong>{c.nombre}</strong><span>{c.poblacion ?? ''}</span></div>
                  </button>
                </li>
              ))}
            </ul>
            {nueva ? (
              <div className="tarjeta interior">
                <h2>{t('nova.clinicaNueva')}</h2>
                <div className="formulario dos">
                  <Campo etiqueta={t('clinica.nombre')} value={nueva.nombre} onChange={(e) => setNueva({ ...nueva, nombre: e.target.value })} />
                  <Campo etiqueta={t('clinica.poblacion')} value={nueva.poblacion} onChange={(e) => setNueva({ ...nueva, poblacion: e.target.value })} />
                  <Campo etiqueta={t('clinica.telefono')} type="tel" value={nueva.telefono} onChange={(e) => setNueva({ ...nueva, telefono: e.target.value })} />
                </div>
                <div className="acciones">
                  <button type="button" className="boton" disabled={nueva.nombre.trim().length < 2} onClick={() => void crear()}>{t('comun.guardar')}</button>
                  <button type="button" className="boton-texto" onClick={() => setNueva(null)}>{t('caso.cancelar')}</button>
                </div>
              </div>
            ) : (
              <button type="button" className="boton-secundario" onClick={() => setNueva({ nombre: filtro, poblacion: '', telefono: '' })}>
                <Plus size={18} aria-hidden /> {t('nova.clinicaNueva')}
              </button>
            )}
          </>
        )}

        {p.clinica ? (
          <>
            <CampoSelector
              etiqueta={t('nova.veterinario')}
              value={p.derivadorId === null ? '' : String(p.derivadorId)}
              error={p.errores.derivador_id}
              onChange={(e) => p.setDerivadorId(e.target.value ? Number(e.target.value) : null)}
            >
              <option value="">{t('nova.veterinarioSinCuenta')}</option>
              {veterinarios.map((v) => <option key={v.id} value={v.id}>{`${v.nombre} ${v.apellidos}`.trim()}</option>)}
            </CampoSelector>
            {p.derivadorId === null ? (
              <Campo etiqueta={t('nova.veterinarioNombre')} value={p.derivadorNombre} onChange={(e) => p.setDerivadorNombre(e.target.value)} />
            ) : null}
            <CampoSelector etiqueta={t('nova.fisio')} value={p.fisioId === null ? '' : String(p.fisioId)}
              onChange={(e) => p.setFisioId(e.target.value ? Number(e.target.value) : null)}>
              <option value="">{t('nova.sinFisio')}</option>
              {fisios.map((f) => <option key={f.id} value={f.id}>{`${f.nombre} ${f.apellidos}`.trim()}</option>)}
            </CampoSelector>
            <label className="casilla">
              <input type="checkbox" checked={p.cita} onChange={(e) => p.setCita(e.target.checked)} />
              <span>{t('nova.yaTieneCita')}</span>
            </label>
            {p.cita ? (
              <Campo etiqueta={t('nova.primeraVisita')} type="date" value={p.primeraVisita} onChange={(e) => p.setPrimeraVisita(e.target.value)} />
            ) : null}
          </>
        ) : null}
      </div>
    </>
  );
}
