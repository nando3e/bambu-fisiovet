// Ficha de una derivación: /d/casos/:id y /b/casos/:id. Datos del paciente,
// del propietario y de la derivación; Bambú tiene además los botones de
// estado y el historial. Abrirla marca como leídas sus notificaciones.
import { useCallback, useEffect, useState } from 'react';
import { Link, useLocation, useParams, useSearchParams } from 'react-router';
import {
  AlertTriangle, ArrowLeft, CalendarCheck, Check, History, Pencil, PhoneCall, UserRoundCog, X,
} from 'lucide-react';
import { api, ErrorApi, mensajeDe } from '../../api.ts';
import { fecha, haceCuanto, t, type ClaveTexto } from '../../i18n/index.ts';
import { accionesBambu, CERRADOS, EDITABLE_POR_DERIVADOR, type AccionCaso } from '../../estados.ts';
import { Aviso, Campo, CampoSelector, CampoTexto, Cargando, TituloPagina } from '../../componentes/comunes.tsx';
import { avisarCambioNotificaciones } from '../../componentes/Notificaciones.tsx';
import { CamposDerivacion, CamposPaciente, CamposPropietario, pacienteParaApi } from './Formularios.tsx';
import { Hilo } from './Hilo.tsx';
import { Informes } from './Informes.tsx';
import { ChipEstado, fechaCorta, nombreEspecie, nombreEstado, type Ficha } from './comun.tsx';

type Errores = Record<string, string>;
interface Fisio { id: number; nombre: string; apellidos: string; activo: boolean; estado: string }

export function FichaCaso({ zona }: { zona: '/d' | '/b' }) {
  const deriva = zona === '/d';
  const { id } = useParams();
  const ubicacion = useLocation();
  const [ficha, setFicha] = useState<Ficha | null>(null);
  const [error, setError] = useState('');
  const [aviso, setAviso] = useState((ubicacion.state as { aviso?: string } | null)?.aviso ?? '');
  const [editando, setEditando] = useState(false);
  const [url] = useSearchParams();
  const [pestana, setPestana] = useState<'fil' | 'fitxa' | 'informes' | null>(
    url.get('p') === 'informes' ? 'informes' : null,
  );

  const cargar = useCallback(async () => {
    const f = await api.get<Ficha>(`/casos/${id}`);
    setFicha(f);
    if (f.no_leidas > 0) {
      await api.post(`/casos/${id}/leido`).catch(() => {});
      avisarCambioNotificaciones();
    }
  }, [id]);
  useEffect(() => {
    setFicha(null);
    cargar().catch((err) => setError(mensajeDe(err)));
  }, [cargar]);

  if (error && !ficha) return <Aviso tipo="error">{error}</Aviso>;
  if (!ficha) return <Cargando />;

  const puedeEditar = deriva ? EDITABLE_POR_DERIVADOR.includes(ficha.estado) : ficha.estado !== 'borrador';
  // El hilo es lo primero de un caso en marcha; un borrador solo tiene ficha.
  const vista = pestana ?? (ficha.estado === 'borrador' ? 'fitxa' : 'fil');
  const veterinario = ficha.derivador?.nombre ?? ficha.derivador_nombre;
  return (
    <>
      <Link to={deriva ? '/d' : '/b/casos'} className="volver"><ArrowLeft size={16} aria-hidden /> {t('caso.volver')}</Link>
      <TituloPagina
        antetitulo={ficha.clinica.nombre}
        titulo={`${ficha.paciente.nombre || '—'}${ficha.paciente.especie ? ` · ${nombreEspecie(ficha.paciente.especie, ficha.paciente.especie_otra)}` : ''}`}
      >
        <ChipEstado estado={ficha.estado} paraDerivador={deriva} />
      </TituloPagina>
      {aviso ? <Aviso>{aviso}</Aviso> : null}
      {error ? <Aviso tipo="error">{error}</Aviso> : null}

      {deriva && ficha.estado === 'borrador' ? (
        <section className="tarjeta">
          <Link to={`/d/nova?cas=${ficha.id}`} className="boton"><Pencil size={18} aria-hidden /> {t('caso.continuarBorrador')}</Link>
        </section>
      ) : null}

      {!deriva && ficha.atascado ? (
        <Aviso tipo="atencion"><AlertTriangle size={16} aria-hidden /> {t('casos.atascado')}</Aviso>
      ) : null}

      <section className="tarjeta">
        <dl className="datos">
          <Dato etiqueta={t('caso.clinica')} valor={ficha.clinica.nombre} />
          {veterinario ? <Dato etiqueta={t('caso.veterinario')} valor={veterinario} /> : null}
          {ficha.registrado_por ? (
            <Dato etiqueta={<PhoneCall size={14} aria-hidden />} valor={t('caso.registradaPor', { nombre: ficha.registrado_por.nombre })} />
          ) : null}
          <Dato etiqueta={t('caso.fisio')} valor={ficha.fisio?.nombre ?? t('caso.sinFisio')} />
          {ficha.enviado_el ? <Dato etiqueta={t('caso.enviada')} valor={fecha(ficha.enviado_el)} /> : null}
          {ficha.vista_el ? (
            <Dato
              etiqueta={deriva ? t('caso.vista') : t('caso.vistaPor', { nombre: ficha.vista_por ?? '' })}
              valor={haceCuanto(ficha.vista_el)}
            />
          ) : null}
          {ficha.resuelto_el && ficha.estado !== 'rechazada' ? <Dato etiqueta={t('caso.aceptada')} valor={fecha(ficha.resuelto_el)} /> : null}
          {ficha.primera_visita ? <Dato etiqueta={t('caso.primeraVisita')} valor={fechaCorta(ficha.primera_visita)} /> : null}
          {ficha.cerrado_el ? <Dato etiqueta={nombreEstado(ficha.estado, deriva)} valor={fecha(ficha.cerrado_el)} /> : null}
          {ficha.motivo_cierre ? <Dato etiqueta={t('caso.motivoCierre')} valor={ficha.motivo_cierre} /> : null}
          <Dato
            etiqueta={t('caso.consentimiento')}
            valor={ficha.consentimiento_vigente ? t('caso.consentimientoOk') : t('caso.consentimientoFalta')}
          />
        </dl>
        {!deriva ? <Acciones ficha={ficha} alCambiar={(f, msg) => { setFicha(f); setAviso(msg); }} setError={setError} /> : null}
      </section>

      <div className="pestanas" role="tablist">
        {(['fil', 'fitxa', 'informes'] as const).map((p) => (
          <button key={p} type="button" role="tab" aria-selected={vista === p} className={vista === p ? 'activo' : undefined}
            onClick={() => setPestana(p)}>
            {p === 'fil' ? t('hilo.titulo') : p === 'fitxa' ? t('hilo.fitxa') : t('informes.titulo')}
          </button>
        ))}
      </div>

      {vista === 'fil' ? <Hilo casoId={ficha.id} borrador={ficha.estado === 'borrador'} /> : null}
      {vista === 'informes' ? <Informes casoId={ficha.id} zona={zona} estado={ficha.estado} /> : null}

      {vista !== 'fitxa' ? null : editando ? (
        <Edicion ficha={ficha} alTerminar={(f) => {
          setEditando(false);
          if (f) {
            setFicha(f);
            setAviso(t('caso.guardado'));
          }
        }} />
      ) : (
        <>
          <section className="tarjeta">
            <div className="cabecera-seccion">
              <h2>{t('caso.derivacion')}</h2>
              {puedeEditar && ficha.estado !== 'borrador' ? (
                <button type="button" className="boton-secundario" onClick={() => setEditando(true)}>
                  <Pencil size={16} aria-hidden /> {t('caso.editar')}
                </button>
              ) : null}
            </div>
            <dl className="datos apilados">
              <Texto etiqueta="caso.motivo" valor={ficha.motivo} />
              <Texto etiqueta="caso.historia" valor={ficha.historia_clinica} />
              <Texto etiqueta="caso.tratamiento" valor={ficha.tratamiento_actual} />
              <Texto etiqueta="caso.objetivos" valor={ficha.objetivos} />
              <Texto etiqueta="caso.notas" valor={ficha.notas_derivador} />
            </dl>
            {deriva && !puedeEditar ? <p className="texto-suave">{t('caso.noEditable')}</p> : null}
          </section>
          <section className="tarjeta">
            <h2>{t('caso.paciente')}</h2>
            <dl className="datos">
              <Dato etiqueta={t('caso.nombre')} valor={ficha.paciente.nombre} />
              <Dato etiqueta={t('caso.especie')} valor={nombreEspecie(ficha.paciente.especie, ficha.paciente.especie_otra)} />
              <Dato etiqueta={t('caso.raza')} valor={ficha.paciente.raza} />
              <Dato etiqueta={t('caso.sexo')} valor={ficha.paciente.sexo ? t(`sexo.${ficha.paciente.sexo}` as ClaveTexto) : null} />
              <Dato etiqueta={t('caso.esterilizado')} valor={ficha.paciente.esterilizado === null ? null : ficha.paciente.esterilizado ? t('caso.si') : t('caso.no')} />
              <Dato etiqueta={t('caso.fechaNacimiento')} valor={fechaCorta(ficha.paciente.fecha_nacimiento) || ficha.paciente.edad_texto} />
              <Dato etiqueta={t('caso.peso')} valor={ficha.paciente.peso_kg === null ? null : String(ficha.paciente.peso_kg).replace('.', ',')} />
            </dl>
            <h2>{t('caso.propietario')}</h2>
            <dl className="datos">
              <Dato etiqueta={t('caso.nombre')} valor={ficha.propietario.nombre} />
              <Dato etiqueta={t('caso.telefono')} valor={ficha.propietario.telefono} enlace={ficha.propietario.telefono ? `tel:${ficha.propietario.telefono}` : undefined} />
              <Dato etiqueta={t('caso.email')} valor={ficha.propietario.email} />
            </dl>
          </section>
        </>
      )}

      {vista === 'fitxa' && ficha.otros_casos.length > 0 ? (
        <section className="tarjeta">
          <h2>{t('caso.otrosCasos')}</h2>
          <ul className="lista">
            {ficha.otros_casos.map((c) => (
              <li key={c.id}>
                <Link to={`${zona}/casos/${c.id}`} className="fila-enlace">
                  <div className="principal"><strong>{fecha(c.enviado_el ?? c.creado)}</strong></div>
                  <ChipEstado estado={c.estado} paraDerivador={deriva} />
                </Link>
              </li>
            ))}
          </ul>
        </section>
      ) : null}

      {vista === 'fitxa' && !deriva ? <Historial casoId={ficha.id} /> : null}
    </>
  );
}

function Dato({ etiqueta, valor, enlace }: { etiqueta: React.ReactNode; valor: string | null | undefined; enlace?: string | undefined }) {
  return (
    <div>
      <dt>{etiqueta}</dt>
      <dd>{valor ? (enlace ? <a href={enlace}>{valor}</a> : valor) : <span className="texto-tenue">{t('caso.sinDato')}</span>}</dd>
    </div>
  );
}

function Texto({ etiqueta, valor }: { etiqueta: ClaveTexto; valor: string }) {
  if (!valor) return null;
  return (
    <div>
      <dt>{t(etiqueta)}</dt>
      <dd className="texto-largo">{valor}</dd>
    </div>
  );
}

/** Los botones de estado de Bambú, cada uno con lo que pide. */
function Acciones({ ficha, alCambiar, setError }: {
  ficha: Ficha;
  alCambiar: (f: Ficha, aviso: string) => void;
  setError: (e: string) => void;
}) {
  const [abierta, setAbierta] = useState<AccionCaso | 'reasignar' | null>(null);
  const [fisios, setFisios] = useState<Fisio[]>([]);
  const [fisioId, setFisioId] = useState<number | null>(ficha.fisio?.id ?? null);
  const [motivo, setMotivo] = useState('');
  const [visita, setVisita] = useState('');
  const [enviando, setEnviando] = useState(false);
  const acciones = accionesBambu(ficha.estado);
  const puedeReasignar = !CERRADOS.includes(ficha.estado) && ficha.estado !== 'borrador';

  useEffect(() => {
    api.get<{ usuarios: Fisio[] }>('/usuarios?rol=bambu')
      .then((r) => setFisios(r.usuarios.filter((u) => u.activo && u.estado === 'activo')))
      .catch(() => {});
  }, []);

  if (acciones.length === 0 && !puedeReasignar) return null;

  async function hacer(accion: AccionCaso | 'reasignar') {
    setError('');
    setEnviando(true);
    try {
      let f: Ficha;
      if (accion === 'aceptar') f = await api.post<Ficha>(`/casos/${ficha.id}/acepta`, { fisio_id: fisioId });
      else if (accion === 'rechazar') f = await api.post<Ficha>(`/casos/${ficha.id}/rechaza`, { motivo });
      else if (accion === 'iniciar_tratamiento') f = await api.post<Ficha>(`/casos/${ficha.id}/cita`, { primera_visita: visita || null });
      else if (accion === 'abandonar') f = await api.post<Ficha>(`/casos/${ficha.id}/abandona`, { motivo });
      else if (accion === 'alta_manual') f = await api.post<Ficha>(`/casos/${ficha.id}/alta-manual`);
      else f = await api.post<Ficha>(`/casos/${ficha.id}/asigna-fisio`, { fisio_id: fisioId });
      setAbierta(null);
      setMotivo('');
      alCambiar(f, t('caso.guardado'));
    } catch (err) {
      setError(err instanceof ErrorApi && err.campos ? Object.values(err.campos).join(' ') : mensajeDe(err));
    } finally {
      setEnviando(false);
    }
  }

  const ETIQUETA: Record<AccionCaso, ClaveTexto> = {
    aceptar: 'accion.aceptar', rechazar: 'accion.rechazar', iniciar_tratamiento: 'accion.cita',
    abandonar: 'accion.cerrar', alta_manual: 'accion.alta', enviar: 'nova.enviar', descartar: 'nova.descartar',
    alta_por_informe: 'accion.alta',
  };
  const selectorFisio = (
    <CampoSelector etiqueta={t('caso.fisio')} value={fisioId === null ? '' : String(fisioId)}
      onChange={(e) => setFisioId(e.target.value ? Number(e.target.value) : null)}>
      <option value="">{t('caso.sinFisio')}</option>
      {fisios.map((u) => <option key={u.id} value={u.id}>{`${u.nombre} ${u.apellidos}`.trim()}</option>)}
    </CampoSelector>
  );

  return (
    <div className="acciones-caso">
      <div className="acciones">
        {acciones.map((a) => (
          <button
            key={a}
            type="button"
            className={a === 'rechazar' || a === 'abandonar' ? 'boton-secundario' : 'boton'}
            aria-expanded={abierta === a}
            onClick={() => setAbierta(abierta === a ? null : a)}
          >
            {a === 'aceptar' ? <Check size={18} aria-hidden /> : a === 'iniciar_tratamiento' ? <CalendarCheck size={18} aria-hidden />
              : a === 'rechazar' || a === 'abandonar' ? <X size={18} aria-hidden /> : null}
            {t(ETIQUETA[a])}
          </button>
        ))}
        {puedeReasignar && !acciones.includes('aceptar') ? (
          <button type="button" className="boton-texto" onClick={() => setAbierta(abierta === 'reasignar' ? null : 'reasignar')}>
            <UserRoundCog size={18} aria-hidden /> {t('accion.reasignar')}
          </button>
        ) : null}
      </div>

      {abierta ? (
        <div className="tarjeta interior formulario">
          {abierta === 'aceptar' || abierta === 'reasignar' ? selectorFisio : null}
          {abierta === 'rechazar' || abierta === 'abandonar' ? (
            <CampoTexto
              etiqueta={abierta === 'rechazar' ? t('accion.motivoRechazo') : t('accion.motivoCierre')}
              rows={3} value={motivo} onChange={(e) => setMotivo(e.target.value)}
            />
          ) : null}
          {abierta === 'iniciar_tratamiento' ? (
            <Campo etiqueta={t('nova.primeraVisita')} type="date" value={visita} ayuda={t('accion.citaAyuda')}
              onChange={(e) => setVisita(e.target.value)} />
          ) : null}
          {abierta === 'alta_manual' ? <p>{t('accion.altaSeguro')}</p> : null}
          <div className="acciones">
            <button
              type="button"
              className="boton"
              disabled={enviando || ((abierta === 'rechazar' || abierta === 'abandonar') && motivo.trim().length < 3)
                || (abierta === 'reasignar' && fisioId === null)}
              onClick={() => void hacer(abierta)}
            >
              {t('accion.confirmar')}
            </button>
            <button type="button" className="boton-texto" onClick={() => setAbierta(null)}>{t('caso.cancelar')}</button>
          </div>
        </div>
      ) : null}
    </div>
  );
}

function Edicion({ ficha, alTerminar }: { ficha: Ficha; alTerminar: (f: Ficha | null) => void }) {
  const [paciente, setPaciente] = useState(ficha.paciente);
  const [propietario, setPropietario] = useState(ficha.propietario);
  const [derivacion, setDerivacion] = useState({
    motivo: ficha.motivo, historia_clinica: ficha.historia_clinica, tratamiento_actual: ficha.tratamiento_actual,
    objetivos: ficha.objetivos, notas_derivador: ficha.notas_derivador,
  });
  const [errores, setErrores] = useState<Errores>({});
  const [error, setError] = useState('');
  const [enviando, setEnviando] = useState(false);

  async function guardar() {
    setEnviando(true);
    setError('');
    try {
      const f = await api.patch<Ficha>(`/casos/${ficha.id}`, {
        paciente: pacienteParaApi(paciente), propietario, caso: derivacion,
      });
      alTerminar(f);
    } catch (err) {
      if (err instanceof ErrorApi && err.campos) setErrores(err.campos);
      setError(mensajeDe(err));
    } finally {
      setEnviando(false);
    }
  }

  return (
    <section className="tarjeta">
      {error ? <Aviso tipo="error">{error}</Aviso> : null}
      <h2>{t('caso.derivacion')}</h2>
      <CamposDerivacion valor={derivacion} cambiar={setDerivacion} errores={errores} />
      <h2>{t('caso.paciente')}</h2>
      <CamposPaciente valor={paciente} cambiar={(p) => setPaciente({ ...ficha.paciente, ...p })} errores={errores} />
      <h2>{t('caso.propietario')}</h2>
      <CamposPropietario valor={propietario} cambiar={(p) => setPropietario({ ...ficha.propietario, ...p })} errores={errores} />
      <div className="acciones">
        <button type="button" className="boton" disabled={enviando} onClick={() => void guardar()}>{t('caso.guardar')}</button>
        <button type="button" className="boton-texto" onClick={() => alTerminar(null)}>{t('caso.cancelar')}</button>
      </div>
    </section>
  );
}

interface Cambio { id: number; tabla: string; antes: Record<string, unknown> | null; despues: Record<string, unknown> | null; cuando: string; usuario: string | null }

function Historial({ casoId }: { casoId: number }) {
  const [abierto, setAbierto] = useState(false);
  const [cambios, setCambios] = useState<Cambio[] | null>(null);
  useEffect(() => {
    if (!abierto || cambios) return;
    api.get<{ historial: Cambio[] }>(`/casos/${casoId}/historial`).then((r) => setCambios(r.historial)).catch(() => setCambios([]));
  }, [abierto, cambios, casoId]);
  return (
    <section className="tarjeta">
      <button type="button" className="boton-texto" aria-expanded={abierto} onClick={() => setAbierto(!abierto)}>
        <History size={18} aria-hidden /> {t('caso.historial')}
      </button>
      {abierto ? (
        !cambios ? <p className="texto-suave">{t('comun.cargando')}</p> : cambios.length === 0 ? (
          <p className="texto-suave">{t('caso.historialVacio')}</p>
        ) : (
          <ul className="lista historial">
            {cambios.map((c) => (
              <li key={c.id}>
                <div className="principal">
                  <strong>{Object.keys(c.despues ?? {}).join(', ') || c.tabla}</strong>
                  <span>
                    {Object.entries(c.despues ?? {}).map(([k, v]) => `${k}: ${String(c.antes?.[k] ?? '—')} → ${String(v ?? '—')}`).join(' · ')}
                  </span>
                  <span>{[c.usuario, fecha(c.cuando)].filter(Boolean).join(' · ')}</span>
                </div>
              </li>
            ))}
          </ul>
        )
      ) : null}
    </section>
  );
}
