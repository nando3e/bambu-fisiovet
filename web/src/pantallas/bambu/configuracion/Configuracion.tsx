// Configuració: Equip, Contacte web, Avisos, Textos legals, Servidor de correu
// (solo superadmin) y Retenció. Cada pestaña es una ruta: los avisos enlazan aquí.
import { useCallback, useEffect, useState, type FormEvent } from 'react';
import { Navigate, NavLink, Route, Routes } from 'react-router';
import {
  Archive, Bell, FileText, Globe, Image, Mail, RotateCcw, Send, Server, Sparkles, Upload, Users, UserPlus,
} from 'lucide-react';
import { api, ErrorApi, mensajeDe } from '../../../api.ts';
import { fecha, t, type ClaveTexto } from '../../../i18n/index.ts';
import { useSesion } from '../../../sesion.tsx';
import { Aviso, Ayuda, Campo, CampoSelector, CampoTexto, Cargando, Interruptor, TituloPagina } from '../../../componentes/comunes.tsx';

export function Configuracion() {
  const { usuario } = useSesion();
  const superadmin = usuario?.rol === 'superadmin';
  const pestanas = [
    { a: '/b/configuracio/equip', texto: t('config.equipo'), icono: Users },
    { a: '/b/configuracio/contacte', texto: t('config.contacto'), icono: Globe },
    { a: '/b/configuracio/imatges', texto: t('config.imagenes'), icono: Image },
    { a: '/b/configuracio/avisos', texto: t('config.avisos'), icono: Bell },
    { a: '/b/configuracio/textos', texto: t('config.textos'), icono: FileText },
    ...(superadmin ? [{ a: '/b/configuracio/correu', texto: t('config.correo'), icono: Server }] : []),
    ...(superadmin ? [{ a: '/b/configuracio/ia', texto: t('config.ia'), icono: Sparkles }] : []),
    { a: '/b/configuracio/retencio', texto: t('config.retencion'), icono: Archive },
  ];
  return (
    <>
      <TituloPagina titulo={t('config.titulo')} subtitulo={t('config.subtitulo')} />
      <nav className="pestanas" aria-label={t('config.titulo')}>
        {pestanas.map(({ a, texto, icono: Icono }) => (
          <NavLink key={a} to={a} className={({ isActive }) => (isActive ? 'activo' : undefined)}>
            <Icono size={16} aria-hidden /> {texto}
          </NavLink>
        ))}
      </nav>
      <Routes>
        <Route index element={<Navigate to="/b/configuracio/equip" replace />} />
        <Route path="equip" element={<Equipo />} />
        <Route path="contacte" element={<ContactoWeb />} />
        <Route path="imatges" element={<ImagenesWeb />} />
        <Route path="avisos" element={<Avisos />} />
        <Route path="textos" element={<TextosLegales />} />
        {superadmin ? <Route path="correu" element={<ServidorCorreo />} /> : null}
        {superadmin ? <Route path="ia" element={<IntelArtificial />} /> : null}
        <Route path="retencio" element={<Retencion />} />
        <Route path="*" element={<Navigate to="/b/configuracio/equip" replace />} />
      </Routes>
    </>
  );
}

type Estado = { ok?: string; error?: string; campos?: Record<string, string> };

function errorEn(err: unknown): Estado {
  return { error: mensajeDe(err), campos: err instanceof ErrorApi ? err.campos : undefined };
}

// ---------- Equip ----------

interface MiembroEquipo {
  id: number;
  nombre: string;
  apellidos: string;
  email: string | null;
  usuario: string | null;
  rol: string;
  activo: boolean;
  es_de_entorno: boolean;
  estado: 'activo' | 'invitado' | 'desactivado';
  ultimo_acceso: string | null;
}

function Equipo() {
  const { usuario } = useSesion();
  const [lista, setLista] = useState<MiembroEquipo[] | null>(null);
  const [estado, setEstado] = useState<Estado>({});
  const [nuevo, setNuevo] = useState({ nombre: '', apellidos: '', email: '' });

  const cargar = useCallback(async () => {
    const r = await api.get<{ usuarios: MiembroEquipo[] }>('/usuarios');
    setLista(r.usuarios);
  }, []);
  useEffect(() => {
    cargar().catch((err) => setEstado(errorEn(err)));
  }, [cargar]);

  async function hacer(fn: () => Promise<unknown>, ok: string) {
    setEstado({});
    try {
      await fn();
      setEstado({ ok });
      await cargar();
    } catch (err) {
      setEstado(errorEn(err));
    }
  }

  if (!lista) return <Cargando />;
  return (
    <>
      {estado.ok ? <Aviso>{estado.ok}</Aviso> : null}
      {estado.error ? <Aviso tipo="error">{estado.error}</Aviso> : null}
      <ul className="lista" style={{ marginBottom: 18 }}>
        {lista.map((m) => (
          <li key={m.id} style={{ flexWrap: 'wrap' }}>
            <div className="principal">
              <strong>{`${m.nombre} ${m.apellidos}`.trim()}</strong>
              <span>{m.es_de_entorno ? t('equipo.superadmin', { usuario: m.usuario ?? '' }) : m.email}</span>
            </div>
            {m.es_de_entorno ? <span className="chip">{t('equipo.cuentaServicio')}</span> : (
              <>
                <span className={`chip${m.estado === 'activo' ? '' : m.estado === 'invitado' ? ' atencion' : ' gris'}`}>
                  {t(`equipo.estado.${m.estado}` as ClaveTexto)}
                </span>
                {m.estado === 'invitado' ? (
                  <button type="button" className="boton-texto" onClick={() => hacer(() => api.post(`/usuarios/${m.id}/reenvia-invitacion`), t('equipo.reenviada'))}>
                    <Send size={16} aria-hidden /> {t('equipo.reenviar')}
                  </button>
                ) : null}
                {m.id !== usuario?.id ? (
                  <button
                    type="button"
                    className={m.activo ? 'boton-texto' : 'boton-secundario'}
                    onClick={() => hacer(() => api.patch(`/usuarios/${m.id}`, { activo: !m.activo }), t('comun.guardado'))}
                  >
                    {m.activo ? t('equipo.desactivar') : t('equipo.reactivar')}
                  </button>
                ) : null}
              </>
            )}
          </li>
        ))}
      </ul>
      <section className="tarjeta">
        <h2 style={{ display: 'flex', gap: 8, alignItems: 'center' }}><UserPlus size={18} aria-hidden /> {t('equipo.invitar')}</h2>
        <p className="ayuda">{t('equipo.invitarAyuda')}</p>
        <form
          className="formulario dos"
          onSubmit={(e) => {
            e.preventDefault();
            void hacer(async () => {
              await api.post('/usuarios', nuevo);
              setNuevo({ nombre: '', apellidos: '', email: '' });
            }, t('equipo.invitacionEnviada'));
          }}
        >
          <Campo etiqueta={t('alta.nombre')} value={nuevo.nombre} onChange={(e) => setNuevo({ ...nuevo, nombre: e.target.value })} error={estado.campos?.nombre} />
          <Campo etiqueta={t('alta.apellidos')} value={nuevo.apellidos} onChange={(e) => setNuevo({ ...nuevo, apellidos: e.target.value })} />
          <Campo className="entero" etiqueta={t('alta.email')} type="email" value={nuevo.email} onChange={(e) => setNuevo({ ...nuevo, email: e.target.value })} error={estado.campos?.email} />
          <div className="entero acciones">
            <button type="submit" className="boton" disabled={!nuevo.nombre || !nuevo.email}>{t('equipo.enviarInvitacion')}</button>
          </div>
        </form>
      </section>
    </>
  );
}

// ---------- Contacte web ----------

interface Contacto {
  email: string;
  telefono: string;
  direccion: string;
  horario: string;
  maps_url: string;
  instagram: string;
}

function ContactoWeb() {
  const [d, setD] = useState<Contacto | null>(null);
  const [estado, setEstado] = useState<Estado>({});
  useEffect(() => {
    api.get<{ contacto: Contacto }>('/configuracion').then((r) => setD(r.contacto)).catch((err) => setEstado(errorEn(err)));
  }, []);
  if (!d) return estado.error ? <Aviso tipo="error">{estado.error}</Aviso> : <Cargando />;

  async function guardar(e: FormEvent) {
    e.preventDefault();
    setEstado({});
    try {
      setD(await api.put<Contacto>('/configuracion/contacto', d));
      setEstado({ ok: t('config.contactoGuardado') });
    } catch (err) {
      setEstado(errorEn(err));
    }
  }

  const campo = (clave: keyof Contacto, etiqueta: ClaveTexto, tipo = 'text', ayuda?: ClaveTexto) => (
    <Campo
      etiqueta={t(etiqueta)}
      type={tipo}
      value={d[clave]}
      onChange={(e) => setD({ ...d, [clave]: e.target.value })}
      error={estado.campos?.[clave]}
      ayuda={ayuda ? t(ayuda) : undefined}
    />
  );

  return (
    <section className="tarjeta">
      <p className="ayuda">{t('config.contactoAyuda')}</p>
      <form className="formulario dos" onSubmit={guardar}>
        {estado.ok ? <div className="entero"><Aviso>{estado.ok}</Aviso></div> : null}
        {estado.error ? <div className="entero"><Aviso tipo="error">{estado.error}</Aviso></div> : null}
        {campo('email', 'config.contacto.email', 'email')}
        {campo('telefono', 'config.contacto.telefono', 'tel')}
        {campo('direccion', 'config.contacto.direccion')}
        {campo('horario', 'config.contacto.horario', 'text', 'config.contacto.horarioAyuda')}
        {campo('maps_url', 'config.contacto.maps', 'url', 'config.contacto.urlAyuda')}
        {campo('instagram', 'config.contacto.instagram', 'url', 'config.contacto.urlAyuda')}
        <div className="entero acciones">
          <button type="submit" className="boton">{t('comun.guardar')}</button>
          <a href="/" target="_blank" rel="noopener" className="boton-texto">{t('config.verWeb')}</a>
        </div>
      </form>
    </section>
  );
}

// ---------- Imatges de la web ----------

const HUECOS_IMAGEN = [
  { hueco: 'portada', etiqueta: 'imagenes.portada', deSerie: '/img/portada.webp' },
  { hueco: 'instalaciones', etiqueta: 'imagenes.instalaciones', deSerie: '/img/instalaciones.webp' },
] as const;

function ImagenesWeb() {
  const [urls, setUrls] = useState<Record<string, string | null> | null>(null);
  const [estado, setEstado] = useState<Estado>({});
  const [subiendo, setSubiendo] = useState<string | null>(null);

  useEffect(() => {
    api.get<Record<string, string | null>>('/publico/imagenes').then(setUrls).catch((err) => setEstado(errorEn(err)));
  }, []);
  if (!urls) return estado.error ? <Aviso tipo="error">{estado.error}</Aviso> : <Cargando />;

  async function subir(hueco: string, fichero: File | undefined) {
    if (!fichero) return;
    setEstado({});
    setSubiendo(hueco);
    try {
      const r = await api.subir<{ url: string }>(`/configuracion/imagenes/${hueco}`, fichero, 'imagen');
      setUrls((u) => ({ ...u, [hueco]: r.url }));
      setEstado({ ok: t('imagenes.subida') });
    } catch (err) {
      setEstado(errorEn(err));
    } finally {
      setSubiendo(null);
    }
  }

  return (
    <>
      <p className="texto-suave">{t('imagenes.ayuda')}</p>
      {estado.ok ? <Aviso>{estado.ok}</Aviso> : null}
      {estado.error ? <Aviso tipo="error">{estado.error}</Aviso> : null}
      <div className="rejilla-tarjetas">
        {HUECOS_IMAGEN.map(({ hueco, etiqueta, deSerie }) => (
          <section key={hueco} className="tarjeta" style={{ marginBottom: 0 }}>
            <h2>{t(etiqueta)}</h2>
            <img
              src={urls[hueco] ?? deSerie}
              alt=""
              style={{ width: '100%', aspectRatio: '4 / 3', objectFit: 'cover', borderRadius: 14, margin: '8px 0 10px' }}
            />
            <span className={`chip${urls[hueco] ? '' : ' gris'}`}>{urls[hueco] ? t('imagenes.propia') : t('imagenes.deSerie')}</span>
            <div className="acciones" style={{ marginTop: 12 }}>
              <label className="boton-secundario" style={{ cursor: 'pointer' }}>
                <Upload size={16} aria-hidden /> {subiendo === hueco ? t('comun.un_momento') : t('imagenes.subir')}
                <input
                  type="file"
                  accept="image/jpeg,image/png,image/webp"
                  hidden
                  disabled={subiendo !== null}
                  onChange={(e) => {
                    void subir(hueco, e.target.files?.[0]);
                    e.target.value = '';
                  }}
                />
              </label>
              {urls[hueco] ? (
                <button
                  type="button"
                  className="boton-texto"
                  onClick={async () => {
                    try {
                      await api.post(`/configuracion/imagenes/${hueco}/restaura`);
                      setUrls((u) => ({ ...u, [hueco]: null }));
                    } catch (err) {
                      setEstado(errorEn(err));
                    }
                  }}
                >
                  {t('imagenes.restaurar')}
                </button>
              ) : null}
            </div>
          </section>
        ))}
      </div>
      <p className="texto-suave" style={{ fontSize: '0.85rem', marginTop: 12 }}>{t('imagenes.formatos')}</p>
    </>
  );
}

// ---------- Avisos ----------

interface FilaMatriz {
  evento: string;
  audiencia: 'bambu' | 'derivador' | 'ambas';
  notificacion: boolean;
  correo: boolean;
  correo_a: string | null;
  admite_correo_a: boolean;
}

interface DatosAvisos {
  correo_centro: string;
  dias_sin_noticias: number;
  dias_pendiente_cita: number;
  dry_run: boolean;
  smtp_configurado: boolean;
  matriz: FilaMatriz[];
}

// Orden de los grupos de la matriz: dentro de cada uno, el del catálogo.
const GRUPOS_AVISOS: FilaMatriz['audiencia'][] = ['bambu', 'derivador', 'ambas'];

interface CorreoCola {
  id: number;
  destinatario: string;
  plantilla: string;
  estado: 'pendiente' | 'en_curso' | 'fallido';
  intentos: number;
  error: string | null;
  creado: string;
}

function Avisos() {
  const { usuario } = useSesion();
  const [d, setD] = useState<DatosAvisos | null>(null);
  const [cola, setCola] = useState<CorreoCola[]>([]);
  const [estado, setEstado] = useState<Estado>({});
  const [centro, setCentro] = useState({ correo_centro: '', dias_sin_noticias: 7, dias_pendiente_cita: 3 });

  const cargar = useCallback(async () => {
    const [a, c] = await Promise.all([
      api.get<DatosAvisos>('/configuracion/avisos'),
      api.get<{ correos: CorreoCola[] }>('/configuracion/avisos/cola'),
    ]);
    setD(a);
    setCentro({
      correo_centro: a.correo_centro, dias_sin_noticias: a.dias_sin_noticias, dias_pendiente_cita: a.dias_pendiente_cita,
    });
    setCola(c.correos);
  }, []);
  useEffect(() => {
    cargar().catch((err) => setEstado(errorEn(err)));
  }, [cargar]);

  async function guardarFila(fila: FilaMatriz, cambio: Partial<FilaMatriz>) {
    setEstado({});
    const nueva = { ...fila, ...cambio };
    // Se pinta ya; si el servidor dice que no, se vuelve atrás.
    setD((v) => v && { ...v, matriz: v.matriz.map((f) => (f.evento === fila.evento ? nueva : f)) });
    try {
      await api.put(`/configuracion/avisos/${fila.evento}`, {
        notificacion: nueva.notificacion,
        correo: nueva.correo,
        correo_a: nueva.correo_a ?? '',
      });
    } catch (err) {
      setEstado(errorEn(err));
      setD((v) => v && { ...v, matriz: v.matriz.map((f) => (f.evento === fila.evento ? fila : f)) });
    }
  }

  async function guardarCentro(e: FormEvent) {
    e.preventDefault();
    setEstado({});
    try {
      await api.put('/configuracion/avisos', centro);
      setD((v) => v && { ...v, correo_centro: centro.correo_centro.trim() });
      setEstado({ ok: t('comun.guardado') });
    } catch (err) {
      setEstado(errorEn(err));
    }
  }

  if (!d) return estado.error ? <Aviso tipo="error">{estado.error}</Aviso> : <Cargando />;
  return (
    <>
      {d.dry_run ? <Aviso tipo="atencion">{t('avisos.dryRun')}</Aviso> : null}
      {!d.smtp_configurado ? (
        <Aviso tipo="atencion">
          {usuario?.rol === 'superadmin' ? t('avisos.sinSmtpSuperadmin') : t('avisos.sinSmtp')}
        </Aviso>
      ) : null}
      {estado.ok ? <Aviso>{estado.ok}</Aviso> : null}
      {estado.error ? <Aviso tipo="error">{estado.error}</Aviso> : null}

      <section className="tarjeta">
        <h2 style={{ display: 'flex', gap: 8, alignItems: 'center' }}><Mail size={18} aria-hidden /> {t('avisos.correoCentro')} <Ayuda titulo={t('avisos.correoCentro')} texto="ayuda.avisosCentro" /></h2>
        <p className="ayuda">{t('avisos.correoCentroAyuda')}</p>
        <form className="formulario dos" onSubmit={guardarCentro}>
          <Campo
            etiqueta={t('avisos.correoCentro')}
            type="email"
            value={centro.correo_centro}
            onChange={(e) => setCentro({ ...centro, correo_centro: e.target.value })}
            error={estado.campos?.correo_centro}
          />
          <Campo
            etiqueta={t('avisos.diasPendienteCita')}
            type="number"
            min={1}
            max={60}
            value={centro.dias_pendiente_cita}
            onChange={(e) => setCentro({ ...centro, dias_pendiente_cita: Number(e.target.value) })}
            error={estado.campos?.dias_pendiente_cita}
            ayuda={t('avisos.diasPendienteCitaAyuda')}
          />
          <div className="entero acciones">
            <button type="submit" className="boton">{t('comun.guardar')}</button>
          </div>
        </form>
      </section>

      <section className="tarjeta">
        <h2 style={{ display: 'flex', gap: 8, alignItems: 'center' }}><Bell size={18} aria-hidden /> {t('avisos.matriz')} <Ayuda titulo={t('avisos.matriz')} texto="ayuda.avisosMatriz" /></h2>
        <p className="ayuda">{t('avisos.matrizAyuda')}</p>
        <table className="tabla">
          <thead>
            <tr>
              <th>{t('avisos.columna.evento')}</th>
              <th>{t('avisos.columna.notificacion')}</th>
              <th>{t('avisos.columna.correo')}</th>
              <th>{t('avisos.columna.correoA')}</th>
            </tr>
          </thead>
          {GRUPOS_AVISOS.map((audiencia) => (
            <tbody key={audiencia}>
              <tr className="fila-grupo">
                <th colSpan={4} scope="colgroup">{t(`audiencia.${audiencia}` as ClaveTexto)}</th>
              </tr>
              {d.matriz.filter((f) => f.audiencia === audiencia).map((f) => (
                <FilaAviso key={f.evento} fila={f} correoCentro={d.correo_centro} alGuardar={guardarFila} />
              ))}
            </tbody>
          ))}
        </table>
      </section>

      <section className="tarjeta">
        <h2>{t('avisos.cola')}</h2>
        <p className="ayuda">{t('avisos.colaAyuda')}</p>
        {cola.length === 0 ? (
          <p className="texto-suave">{t('avisos.colaVacia')}</p>
        ) : (
          <ul className="lista">
            {cola.map((c) => (
              <li key={c.id} style={{ flexWrap: 'wrap' }}>
                <div className="principal">
                  <strong>{c.destinatario}</strong>
                  <span>{c.plantilla} · {fecha(c.creado)} · {t('avisos.intentos', { n: c.intentos })}</span>
                  {c.error ? <span style={{ display: 'block', color: 'var(--alerta)' }}>{c.error}</span> : null}
                </div>
                <span className={`chip${c.estado === 'fallido' ? ' error' : ' atencion'}`}>{t(`avisos.estado.${c.estado}` as ClaveTexto)}</span>
                {c.estado === 'fallido' ? (
                  <button
                    type="button"
                    className="boton-texto"
                    onClick={async () => {
                      try {
                        await api.post(`/configuracion/avisos/cola/${c.id}/reintenta`);
                        await cargar();
                      } catch (err) {
                        setEstado(errorEn(err));
                      }
                    }}
                  >
                    <RotateCcw size={16} aria-hidden /> {t('avisos.reintentar')}
                  </button>
                ) : null}
              </li>
            ))}
          </ul>
        )}
      </section>
    </>
  );
}

function FilaAviso({ fila, correoCentro, alGuardar }: {
  fila: FilaMatriz;
  correoCentro: string;
  alGuardar: (f: FilaMatriz, cambio: Partial<FilaMatriz>) => Promise<void>;
}) {
  const [correoA, setCorreoA] = useState(fila.correo_a ?? '');
  // Si el servidor rechaza el cambio, el campo vuelve a lo guardado.
  useEffect(() => setCorreoA(fila.correo_a ?? ''), [fila.correo_a]);
  const etiqueta = t(`evento.${fila.evento}` as ClaveTexto);
  // Sin dirección, un aviso solo del equipo no llega a nadie: se ve apagado y
  // no se enciende. Los de las dos partes llegan igualmente al veterinario.
  const sinDireccion = fila.audiencia === 'bambu' && !fila.correo_a && !correoCentro;
  return (
    <tr>
      <td data-etiqueta={t('avisos.columna.evento')}>
        <div className="celda-evento">
          <strong style={{ display: 'block' }}>{etiqueta}</strong>
        </div>
      </td>
      <td data-etiqueta={t('avisos.columna.notificacion')}>
        <Interruptor
          etiqueta={`${t('avisos.columna.notificacion')}: ${etiqueta}`}
          marcado={fila.notificacion}
          alCambiar={(v) => void alGuardar(fila, { notificacion: v })}
        />
      </td>
      <td data-etiqueta={t('avisos.columna.correo')}>
        <Interruptor
          etiqueta={`${t('avisos.columna.correo')}: ${etiqueta}`}
          marcado={fila.correo && !sinDireccion}
          desactivado={sinDireccion}
          alCambiar={(v) => void alGuardar(fila, { correo: v })}
        />
      </td>
      <td data-etiqueta={t('avisos.columna.correoA')}>
        {fila.admite_correo_a ? (
          <input
            type="text"
            inputMode="email"
            aria-label={`${t('avisos.columna.correoA')}: ${etiqueta}`}
            placeholder={correoCentro || t('avisos.correoAVacio')}
            value={correoA}
            onChange={(e) => setCorreoA(e.target.value)}
            onBlur={() => {
              if ((fila.correo_a ?? '') !== correoA.trim()) void alGuardar(fila, { correo_a: correoA.trim() || null });
            }}
            style={{ width: '100%', minWidth: 180, border: '1px solid var(--linea)', borderRadius: 10, padding: '8px 10px', background: 'var(--papel)' }}
          />
        ) : (
          <span className="texto-suave" style={{ fontSize: '0.85rem' }}>{t('avisos.alVeterinario')}</span>
        )}
      </td>
    </tr>
  );
}

// ---------- Servidor de correu (solo superadmin) ----------

interface ServidorCorreoDatos {
  host: string;
  puerto: number;
  seguridad: 'starttls' | 'ssl';
  usuario: string;
  remitente_nombre: string;
  remitente_email: string;
  contrasena_configurada: boolean;
}

function ServidorCorreo() {
  const { usuario } = useSesion();
  const [d, setD] = useState<ServidorCorreoDatos | null>(null);
  const [contrasena, setContrasena] = useState('');
  const [estado, setEstado] = useState<Estado>({});
  const [prueba, setPrueba] = useState({ para: '', enviando: false, resultado: '' as string, ok: false });

  useEffect(() => {
    api.get<ServidorCorreoDatos>('/configuracion/correo').then(setD).catch((err) => setEstado(errorEn(err)));
  }, []);
  useEffect(() => {
    if (usuario?.email) setPrueba((p) => ({ ...p, para: p.para || usuario.email! }));
  }, [usuario]);

  if (!d) return estado.error ? <Aviso tipo="error">{estado.error}</Aviso> : <Cargando />;

  async function guardar(e: FormEvent) {
    e.preventDefault();
    if (!d) return;
    setEstado({});
    try {
      const { contrasena_configurada: _ya, ...resto } = d;
      setD(await api.put<ServidorCorreoDatos>('/configuracion/correo', { ...resto, contrasena }));
      setContrasena('');
      setEstado({ ok: t('correo.guardado') });
    } catch (err) {
      setEstado(errorEn(err));
    }
  }

  async function probar(e: FormEvent) {
    e.preventDefault();
    setPrueba((p) => ({ ...p, enviando: true, resultado: '' }));
    try {
      const r = await api.post<{ enviado: boolean; error?: string }>('/configuracion/correo/prueba', { para: prueba.para });
      setPrueba((p) => ({ ...p, enviando: false, ok: r.enviado, resultado: r.enviado ? t('correo.pruebaOk', { para: p.para }) : (r.error ?? '') }));
    } catch (err) {
      setPrueba((p) => ({ ...p, enviando: false, ok: false, resultado: mensajeDe(err) }));
    }
  }

  return (
    <>
      <section className="tarjeta">
        <p className="ayuda">{t('correo.ayuda')}</p>
        <form className="formulario dos" onSubmit={guardar}>
          {estado.ok ? <div className="entero"><Aviso>{estado.ok}</Aviso></div> : null}
          {estado.error ? <div className="entero"><Aviso tipo="error">{estado.error}</Aviso></div> : null}
          <Campo etiqueta={t('correo.host')} value={d.host} onChange={(e) => setD({ ...d, host: e.target.value })} placeholder="smtp.dondominio.com" />
          <Campo etiqueta={t('correo.puerto')} type="number" value={d.puerto} onChange={(e) => setD({ ...d, puerto: Number(e.target.value) })} />
          <CampoSelector etiqueta={t('correo.seguridad')} value={d.seguridad} onChange={(e) => setD({ ...d, seguridad: e.target.value as 'starttls' | 'ssl' })}>
            <option value="starttls">{t('correo.starttls')}</option>
            <option value="ssl">{t('correo.ssl')}</option>
          </CampoSelector>
          <Campo etiqueta={t('correo.usuario')} autoComplete="off" value={d.usuario} onChange={(e) => setD({ ...d, usuario: e.target.value })} />
          <Campo
            className="entero"
            etiqueta={t('correo.contrasena')}
            type="password"
            autoComplete="new-password"
            value={contrasena}
            onChange={(e) => setContrasena(e.target.value)}
            placeholder={d.contrasena_configurada ? '••••••••' : ''}
            ayuda={d.contrasena_configurada ? t('correo.contrasenaGuardada') : t('correo.contrasenaNueva')}
          />
          <Campo etiqueta={t('correo.remitenteNombre')} value={d.remitente_nombre} onChange={(e) => setD({ ...d, remitente_nombre: e.target.value })} />
          <Campo
            etiqueta={t('correo.remitenteEmail')}
            type="email"
            value={d.remitente_email}
            onChange={(e) => setD({ ...d, remitente_email: e.target.value })}
            placeholder="avisos@bambufisiovet.com"
            error={estado.campos?.remitente_email}
          />
          <div className="entero acciones">
            <button type="submit" className="boton">{t('comun.guardar')}</button>
          </div>
        </form>
      </section>
      <section className="tarjeta">
        <h2 style={{ display: 'flex', gap: 8, alignItems: 'center' }}><Send size={18} aria-hidden /> {t('correo.prueba')}</h2>
        <p className="ayuda">{t('correo.pruebaAyuda')}</p>
        <form className="formulario" onSubmit={probar}>
          {prueba.resultado ? <Aviso tipo={prueba.ok ? 'ok' : 'error'}>{prueba.resultado}</Aviso> : null}
          <Campo etiqueta={t('correo.pruebaPara')} type="email" value={prueba.para} onChange={(e) => setPrueba({ ...prueba, para: e.target.value })} />
          <div className="acciones">
            <button type="submit" className="boton-secundario" disabled={prueba.enviando || !prueba.para}>
              {prueba.enviando ? t('comun.un_momento') : t('correo.pruebaEnviar')}
            </button>
          </div>
        </form>
      </section>
    </>
  );
}

// ---------- Intel·ligència artificial (superadmin) ----------

interface DatosIa {
  anthropic_configurada: boolean;
  openai_configurada: boolean;
  anthropic_disponible: boolean;
  openai_disponible: boolean;
  modelo_informe: string;
  modelo_informe_openai: string;
  modelo_transcripcion: string;
}

function IntelArtificial() {
  const [d, setD] = useState<DatosIa | null>(null);
  const [claves, setClaves] = useState({ anthropic: '', openai: '' });
  const [estado, setEstado] = useState<Estado>({});
  useEffect(() => {
    api.get<DatosIa>('/configuracion/ia').then(setD).catch((err) => setEstado(errorEn(err)));
  }, []);
  if (!d) return estado.error ? <Aviso tipo="error">{estado.error}</Aviso> : <Cargando />;
  async function guardar(extra: { quitar_anthropic?: boolean; quitar_openai?: boolean } = {}) {
    if (!d) return;
    setEstado({});
    try {
      const r = await api.put<DatosIa>('/configuracion/ia', {
        ...claves, ...extra,
        modelo_informe: d.modelo_informe, modelo_informe_openai: d.modelo_informe_openai, modelo_transcripcion: d.modelo_transcripcion,
      });
      setD(r);
      setClaves({ anthropic: '', openai: '' });
      setEstado({ ok: t('comun.guardado') });
    } catch (err) {
      setEstado(errorEn(err));
    }
  }
  return (
    <section className="tarjeta">
      <p className="ayuda">{t('ia.ayuda')}</p>
      {estado.ok ? <Aviso>{estado.ok}</Aviso> : null}
      {estado.error ? <Aviso tipo="error">{estado.error}</Aviso> : null}
      <form className="formulario dos" onSubmit={(e) => { e.preventDefault(); void guardar(); }}>
        <Campo etiqueta={t('ia.anthropic')} type="password" autoComplete="off" value={claves.anthropic}
          onChange={(e) => setClaves({ ...claves, anthropic: e.target.value })}
          ayuda={d.anthropic_configurada ? t('ia.configurada') : d.anthropic_disponible ? t('ia.entorno') : undefined} />
        <Campo etiqueta={t('ia.openai')} type="password" autoComplete="off" value={claves.openai}
          onChange={(e) => setClaves({ ...claves, openai: e.target.value })}
          ayuda={d.openai_configurada ? t('ia.configurada') : d.openai_disponible ? t('ia.entorno') : undefined} />
        <Campo etiqueta={t('ia.modeloInforme')} value={d.modelo_informe} onChange={(e) => setD({ ...d, modelo_informe: e.target.value })} />
        <Campo etiqueta={t('ia.modeloInformeOpenai')} value={d.modelo_informe_openai} onChange={(e) => setD({ ...d, modelo_informe_openai: e.target.value })} />
        <Campo etiqueta={t('ia.modeloTranscripcion')} value={d.modelo_transcripcion} onChange={(e) => setD({ ...d, modelo_transcripcion: e.target.value })} />
        <div className="entero acciones">
          <button type="submit" className="boton">{t('comun.guardar')}</button>
          {d.anthropic_configurada ? <button type="button" className="boton-texto" onClick={() => void guardar({ quitar_anthropic: true })}>{t('ia.quitar')} (Anthropic)</button> : null}
          {d.openai_configurada ? <button type="button" className="boton-texto" onClick={() => void guardar({ quitar_openai: true })}>{t('ia.quitar')} (OpenAI)</button> : null}
          <button type="button" className="boton-secundario" onClick={async () => {
            setEstado({});
            try {
              const r = await api.post<{ ok: boolean; modelo?: string; latencia_ms?: number; error?: string }>('/configuracion/ia/prueba');
              setEstado(r.ok ? { ok: t('ia.pruebaOk', { modelo: r.modelo ?? '', ms: r.latencia_ms ?? 0 }) } : { error: r.error });
            } catch (err) {
              setEstado(errorEn(err));
            }
          }}><Sparkles size={16} aria-hidden /> {t('ia.probar')}</button>
        </div>
      </form>
    </section>
  );
}

// ---------- Textos legals ----------

function TextosLegales() {
  const [consentimiento, setConsentimiento] = useState<{ texto: string; version: number } | null>(null);
  const [estado, setEstado] = useState<Estado>({});
  const cargar = useCallback(async () => {
    const r = await api.get<{ consentimiento: { texto: string; version: number } }>('/configuracion');
    setConsentimiento(r.consentimiento);
  }, []);
  useEffect(() => {
    cargar().catch((err) => setEstado(errorEn(err)));
  }, [cargar]);
  if (!consentimiento) return estado.error ? <Aviso tipo="error">{estado.error}</Aviso> : <Cargando />;
  return (
    <section className="tarjeta">
      <h2>{t('textos.consentimiento')}</h2>
      <p className="ayuda">{t('textos.consentimientoAyuda')}</p>
      <form
        className="formulario"
        onSubmit={async (e) => {
          e.preventDefault();
          setEstado({});
          try {
            await api.put('/configuracion/consentimiento', { texto: consentimiento.texto });
            await cargar();
            setEstado({ ok: t('textos.guardado') });
          } catch (err) {
            setEstado(errorEn(err));
          }
        }}
      >
        {estado.ok ? <Aviso>{estado.ok}</Aviso> : null}
        {estado.error ? <Aviso tipo="error">{estado.error}</Aviso> : null}
        <CampoTexto
          etiqueta={t('textos.version', { n: consentimiento.version })}
          rows={8}
          value={consentimiento.texto}
          error={estado.campos?.texto}
          onChange={(e) => setConsentimiento({ ...consentimiento, texto: e.target.value })}
        />
        <div className="acciones">
          <button type="submit" className="boton">{t('comun.guardar')}</button>
        </div>
      </form>
    </section>
  );
}

// ---------- Retenció ----------

function Retencion() {
  const [dias, setDias] = useState<number | null>(null);
  const [estado, setEstado] = useState<Estado>({});
  useEffect(() => {
    api.get<{ retencion: { audio_dias: number } }>('/configuracion').then((r) => setDias(r.retencion.audio_dias)).catch((err) => setEstado(errorEn(err)));
  }, []);
  if (dias === null) return estado.error ? <Aviso tipo="error">{estado.error}</Aviso> : <Cargando />;
  return (
    <section className="tarjeta">
      <p className="ayuda">{t('retencion.ayuda')}</p>
      <form
        className="formulario"
        onSubmit={async (e) => {
          e.preventDefault();
          setEstado({});
          try {
            await api.put('/configuracion/retencion', { audio_dias: dias });
            setEstado({ ok: t('comun.guardado') });
          } catch (err) {
            setEstado(errorEn(err));
          }
        }}
      >
        {estado.ok ? <Aviso>{estado.ok}</Aviso> : null}
        {estado.error ? <Aviso tipo="error">{estado.error}</Aviso> : null}
        <Campo etiqueta={t('retencion.audios')} type="number" min={1} max={365} value={dias} onChange={(e) => setDias(Number(e.target.value))} error={estado.campos?.audio_dias} ayuda={t('retencion.audiosAyuda')} />
        <div className="acciones">
          <button type="submit" className="boton">{t('comun.guardar')}</button>
        </div>
      </form>
    </section>
  );
}
