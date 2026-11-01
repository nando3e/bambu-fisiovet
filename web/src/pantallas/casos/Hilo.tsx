// El hilo del caso: mensajes, notas internas (solo Bambú), mensajes del
// sistema y adjuntos. Las fotos se reducen en el navegador antes de subirlas y
// se ven al momento, atenuadas mientras suben.
import { useCallback, useEffect, useRef, useState } from 'react';
import { FileText, Lock, Paperclip, Send, Trash2 } from 'lucide-react';
import { api, mensajeDe } from '../../api.ts';
import { haceCuanto, t } from '../../i18n/index.ts';
import { useSesion } from '../../sesion.tsx';
import { Aviso, Cargando } from '../../componentes/comunes.tsx';

interface Mensaje {
  id: number;
  tipo: 'texto' | 'adjunto' | 'informe' | 'sistema';
  visibilidad: 'todos' | 'bambu';
  cuerpo: string;
  creado: string;
  autor_id: number | null;
  autor: string | null;
  autor_bambu: boolean | null;
  adjunto_id: number | null;
  adjunto_nombre: string | null;
  adjunto_mime: string | null;
  adjunto_bytes: number | null;
  adjunto_miniatura: boolean | null;
  adjunto_retirado: boolean | null;
  adjunto_subido_por: number | null;
}

interface Subida {
  clave: string;
  nombre: string;
  vista: string | null;
}

const ACEPTADOS = '.pdf,.jpg,.jpeg,.png,.webp,.doc,.docx,.xlsx,.zip,image/*,application/pdf';
const REDUCIR_DESDE = 1.5 * 1024 * 1024;
const MINUTOS_RETIRAR = 15;

/** Una foto grande se reduce a 1600 px en JPEG; si algo falla, va el original. */
async function reducir(fichero: File): Promise<{ datos: Blob; nombre: string }> {
  if (!fichero.type.startsWith('image/') || fichero.size < REDUCIR_DESDE) return { datos: fichero, nombre: fichero.name };
  try {
    const imagen = await createImageBitmap(fichero);
    const escala = Math.min(1, 1600 / Math.max(imagen.width, imagen.height));
    const lienzo = document.createElement('canvas');
    lienzo.width = Math.round(imagen.width * escala);
    lienzo.height = Math.round(imagen.height * escala);
    lienzo.getContext('2d')!.drawImage(imagen, 0, 0, lienzo.width, lienzo.height);
    const blob = await new Promise<Blob | null>((r) => lienzo.toBlob(r, 'image/jpeg', 0.85));
    if (!blob) return { datos: fichero, nombre: fichero.name };
    return { datos: blob, nombre: fichero.name.replace(/\.[^.]+$/, '') + '.jpg' };
  } catch {
    return { datos: fichero, nombre: fichero.name };
  }
}

const tamano = (bytes: number | null) =>
  bytes === null ? '' : bytes > 1024 * 1024 ? `${(bytes / 1024 / 1024).toFixed(1).replace('.', ',')} MB` : `${Math.ceil(bytes / 1024)} KB`;

export function Hilo({ casoId, borrador }: { casoId: number; borrador: boolean }) {
  const { usuario } = useSesion();
  const bambu = usuario?.rol === 'bambu' || usuario?.rol === 'superadmin';
  const [mensajes, setMensajes] = useState<Mensaje[] | null>(null);
  const [texto, setTexto] = useState('');
  const [interna, setInterna] = useState(false);
  const [subidas, setSubidas] = useState<Subida[]>([]);
  const [error, setError] = useState('');
  const [enviando, setEnviando] = useState(false);
  const selector = useRef<HTMLInputElement>(null);
  const final = useRef<HTMLDivElement>(null);

  const cargar = useCallback(async () => {
    const r = await api.get<{ mensajes: Mensaje[] }>(`/casos/${casoId}/mensajes`);
    setMensajes(r.mensajes);
  }, [casoId]);

  useEffect(() => {
    cargar().catch((err) => setError(mensajeDe(err)));
    // Al volver a la pestaña, lo nuevo de los demás.
    const alVolver = () => {
      if (document.visibilityState === 'visible') cargar().catch(() => {});
    };
    document.addEventListener('visibilitychange', alVolver);
    return () => document.removeEventListener('visibilitychange', alVolver);
  }, [cargar]);

  useEffect(() => {
    final.current?.scrollIntoView({ block: 'nearest' });
  }, [mensajes?.length, subidas.length]);

  async function enviar() {
    if (!texto.trim()) return;
    setEnviando(true);
    setError('');
    try {
      await api.post(`/casos/${casoId}/mensajes`, { cuerpo: texto, interna: bambu && interna });
      setTexto('');
      await cargar();
    } catch (err) {
      setError(mensajeDe(err));
    } finally {
      setEnviando(false);
    }
  }

  async function adjuntar(ficheros: FileList | null) {
    if (!ficheros) return;
    setError('');
    for (const fichero of Array.from(ficheros)) {
      const clave = `${Date.now()}-${fichero.name}`;
      const vista = fichero.type.startsWith('image/') ? URL.createObjectURL(fichero) : null;
      setSubidas((s) => [...s, { clave, nombre: fichero.name, vista }]);
      try {
        const { datos, nombre } = await reducir(fichero);
        await api.subir(`/casos/${casoId}/adjuntos`, datos, 'fichero', { interna: String(bambu && interna) }, nombre);
        await cargar();
      } catch (err) {
        setError(t('hilo.errorSubida', { nombre: fichero.name, error: mensajeDe(err) }));
      } finally {
        setSubidas((s) => s.filter((x) => x.clave !== clave));
        if (vista) URL.revokeObjectURL(vista);
      }
    }
    if (selector.current) selector.current.value = '';
  }

  async function retirar(m: Mensaje) {
    if (!m.adjunto_id || !window.confirm(t('hilo.retirarSeguro', { nombre: m.adjunto_nombre ?? '' }))) return;
    try {
      await api.delete(`/adjuntos/${m.adjunto_id}`);
      await cargar();
    } catch (err) {
      setError(mensajeDe(err));
    }
  }

  const puedeRetirar = (m: Mensaje) => !m.adjunto_retirado && (bambu
    || (m.adjunto_subido_por === usuario?.id && Date.now() - new Date(m.creado).getTime() < MINUTOS_RETIRAR * 60_000));

  if (borrador) return <Aviso tipo="info">{t('hilo.borrador')}</Aviso>;
  if (!mensajes) return error ? <Aviso tipo="error">{error}</Aviso> : <Cargando />;
  return (
    <section className="hilo">
      {mensajes.length === 0 && subidas.length === 0 ? <p className="texto-suave">{t('hilo.vacio')}</p> : null}
      <ol className="mensajes">
        {mensajes.map((m) => m.tipo === 'sistema' ? (
          <li key={m.id} className={`mensaje sistema${m.visibilidad === 'bambu' ? ' interna' : ''}`}>
            <span>{m.cuerpo}</span> <time>{haceCuanto(m.creado)}</time>
          </li>
        ) : (
          <li key={m.id} className={`mensaje${m.visibilidad === 'bambu' ? ' interna' : ''}${m.autor_id === usuario?.id ? ' propio' : ''}`}>
            <div className="cabecera-mensaje">
              <strong>{m.autor ?? t('hilo.sistema')}</strong>
              {m.visibilidad === 'bambu' ? <span className="chip atencion"><Lock size={12} aria-hidden /> {t('hilo.esNotaInterna')}</span> : null}
              <time>{haceCuanto(m.creado)}</time>
            </div>
            {m.tipo === 'adjunto' ? (
              m.adjunto_retirado ? <p className="texto-tenue">{t('hilo.retirado')}: {m.adjunto_nombre}</p> : (
                <div className="adjunto">
                  <a href={`/api/adjuntos/${m.adjunto_id}/fichero`} target="_blank" rel="noopener" className="adjunto-enlace">
                    {m.adjunto_miniatura ? (
                      <img src={`/api/adjuntos/${m.adjunto_id}/miniatura`} alt={m.adjunto_nombre ?? ''} loading="lazy" />
                    ) : (
                      <span className="adjunto-icono"><FileText size={22} aria-hidden /></span>
                    )}
                    <span>
                      <b>{m.adjunto_nombre}</b>
                      <small>{tamano(m.adjunto_bytes)}</small>
                    </span>
                  </a>
                  {puedeRetirar(m) ? (
                    <button type="button" className="boton-icono" aria-label={t('hilo.retirar')} onClick={() => void retirar(m)}>
                      <Trash2 size={16} aria-hidden />
                    </button>
                  ) : null}
                </div>
              )
            ) : <p className="cuerpo-mensaje">{m.cuerpo}</p>}
          </li>
        ))}
        {subidas.map((s) => (
          <li key={s.clave} className="mensaje propio subiendo" aria-busy="true">
            <div className="cabecera-mensaje"><strong>{t('hilo.subiendo')}</strong></div>
            <div className="adjunto">
              <span className="adjunto-enlace">
                {s.vista ? <img src={s.vista} alt="" /> : <span className="adjunto-icono"><FileText size={22} aria-hidden /></span>}
                <span><b>{s.nombre}</b></span>
              </span>
            </div>
          </li>
        ))}
      </ol>
      <div ref={final} />
      {error ? <Aviso tipo="error">{error}</Aviso> : null}

      <div className={`compositor${interna ? ' interna' : ''}`}>
        <label className="campo">
          <span className="oculto">{t('hilo.escribir')}</span>
          <textarea
            rows={3}
            value={texto}
            placeholder={t('hilo.escribir')}
            onChange={(e) => setTexto(e.target.value)}
            onKeyDown={(e) => {
              if (e.key === 'Enter' && (e.ctrlKey || e.metaKey)) void enviar();
            }}
          />
        </label>
        <div className="acciones">
          <button type="button" className="boton-secundario" onClick={() => selector.current?.click()} title={t('hilo.adjuntarAyuda')}>
            <Paperclip size={18} aria-hidden /> {t('hilo.adjuntar')}
          </button>
          <input ref={selector} type="file" multiple accept={ACEPTADOS} hidden onChange={(e) => void adjuntar(e.target.files)} />
          {bambu ? (
            <label className="casilla">
              <input type="checkbox" checked={interna} onChange={(e) => setInterna(e.target.checked)} />
              <span><Lock size={14} aria-hidden /> {t('hilo.notaInterna')}</span>
            </label>
          ) : null}
          <button type="button" className="boton" disabled={enviando || !texto.trim()} onClick={() => void enviar()}>
            <Send size={18} aria-hidden /> {t('hilo.enviar')}
          </button>
        </div>
        <small className="texto-suave">{t('hilo.adjuntarAyuda')}</small>
      </div>
    </section>
  );
}
