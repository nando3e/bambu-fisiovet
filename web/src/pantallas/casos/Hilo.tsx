// El hilo del caso, como una conversación: lo que escribe mi lado (Bambú en
// /b, la clínica en /d) a la derecha, lo del otro lado a la izquierda y los
// mensajes del sistema en el centro; el color dice quién escribe (Bambú en
// verde, sus notas internas en amarillo). Los ficheros se preparan junto al
// texto y salen con «Envia», pegados al mensaje; las fotos se reducen en el
// navegador antes de subirlas y se ven al momento, atenuadas mientras suben.
import { useCallback, useEffect, useRef, useState } from 'react';
import { Link } from 'react-router';
import { FileText, Lock, Paperclip, Send, Trash2, X } from 'lucide-react';
import { api, mensajeDe } from '../../api.ts';
import { haceCuanto, t, type ClaveTexto } from '../../i18n/index.ts';
import { useSesion } from '../../sesion.tsx';
import { Aviso, Cargando } from '../../componentes/comunes.tsx';
import { ACEPTADOS, tamano, vistaPrevia } from '../../imagenes.ts';
import { useSubidas } from '../../subidas.ts';
import type { Categoria } from './Documentos.tsx';

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
  adjunto_categoria: Categoria | null;
  informe_id: number | null;
}

/** Un fichero elegido que todavía no ha salido (se ve en el compositor). */
interface Preparado {
  clave: string;
  fichero: File;
  vista: string | null;
}

const MINUTOS_RETIRAR = 15;
/** Mensajes seguidos de la misma persona en este margen se pintan juntos. */
const JUNTOS_MS = 5 * 60_000;

const CHIP_CATEGORIA: Record<Categoria, ClaveTexto> = {
  radiografia: 'doc.chip.radiografia', informe: 'doc.chip.informe', analitica: 'doc.chip.analitica',
};

/** Quién lo escribió: Bambú (y sus notas internas) o la clínica. */
const deBambu = (m: Mensaje) => m.autor_bambu === true || m.visibilidad === 'bambu';

export function Hilo({ casoId, borrador }: { casoId: number; borrador: boolean }) {
  const { usuario } = useSesion();
  const bambu = usuario?.rol === 'bambu' || usuario?.rol === 'superadmin';
  const [mensajes, setMensajes] = useState<Mensaje[] | null>(null);
  const [texto, setTexto] = useState('');
  const [interna, setInterna] = useState(false);
  const [preparados, setPreparados] = useState<Preparado[]>([]);
  const [error, setError] = useState('');
  const [enviando, setEnviando] = useState(false);
  const selector = useRef<HTMLInputElement>(null);
  const final = useRef<HTMLDivElement>(null);

  const cargar = useCallback(async () => {
    const r = await api.get<{ mensajes: Mensaje[] }>(`/casos/${casoId}/mensajes`);
    setMensajes(r.mensajes);
  }, [casoId]);
  const subidas = useSubidas(cargar);

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
  }, [mensajes?.length, subidas.enCurso.length]);

  function preparar(ficheros: FileList | null) {
    if (!ficheros) return;
    const nuevos = Array.from(ficheros).map((fichero) => ({
      clave: `${Date.now()}-${Math.random().toString(36).slice(2, 7)}-${fichero.name}`,
      fichero,
      vista: vistaPrevia(fichero),
    }));
    setPreparados((p) => [...p, ...nuevos]);
    if (selector.current) selector.current.value = '';
  }

  function quitar(clave: string) {
    setPreparados((p) => {
      const fuera = p.find((x) => x.clave === clave);
      if (fuera?.vista) URL.revokeObjectURL(fuera.vista);
      return p.filter((x) => x.clave !== clave);
    });
  }

  // El texto (si lo hay) y después cada fichero preparado, en ese orden, como
  // nota interna o no según la casilla en el momento de enviar.
  async function enviar() {
    if (!texto.trim() && preparados.length === 0) return;
    setEnviando(true);
    setError('');
    subidas.limpiarError();
    const loteInterno = bambu && interna;
    const lote = preparados;
    try {
      if (texto.trim()) {
        await api.post(`/casos/${casoId}/mensajes`, { cuerpo: texto, interna: loteInterno });
        setTexto('');
      }
      setPreparados([]);
      for (const p of lote) if (p.vista) URL.revokeObjectURL(p.vista);
      // La fila recarga el hilo al acabar el lote; sin ficheros, se recarga aquí.
      if (lote.length > 0) await subidas.encolar(lote.map((p) => p.fichero), `/casos/${casoId}/adjuntos`, { interna: String(loteInterno) });
      else await cargar();
    } catch (err) {
      setError(mensajeDe(err));
    } finally {
      setEnviando(false);
    }
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

  /** Si sigue al anterior de la misma persona (sin cabecera, más pegado). */
  const seguido = (m: Mensaje, i: number) => {
    const antes = mensajes?.[i - 1];
    return Boolean(antes && antes.tipo !== 'sistema' && m.tipo !== 'sistema' && antes.autor_id === m.autor_id
      && antes.visibilidad === m.visibilidad && new Date(m.creado).getTime() - new Date(antes.creado).getTime() < JUNTOS_MS);
  };

  /** A mi lado (derecha) o al del otro: según la población de quien mira. */
  const clases = (m: Mensaje) =>
    `mensaje ${deBambu(m) === bambu ? 'propio' : 'ajeno'} ${deBambu(m) ? 'de-bambu' : 'de-veterinario'}`;

  if (borrador) return <Aviso tipo="info">{t('hilo.borrador')}</Aviso>;
  if (!mensajes) return error ? <Aviso tipo="error">{error}</Aviso> : <Cargando />;
  const mensajeError = error || subidas.error;
  return (
    <section className="hilo">
      {mensajes.length === 0 && subidas.enCurso.length === 0 ? <p className="texto-suave">{t('hilo.vacio')}</p> : null}
      <ol className="mensajes">
        {mensajes.map((m, i) => m.tipo === 'sistema' ? (
          <li key={m.id} className={`mensaje sistema${m.visibilidad === 'bambu' ? ' interna' : ''}`}>
            <span>{m.cuerpo}</span> <time>{haceCuanto(m.creado)}</time>
          </li>
        ) : (
          <li
            key={m.id}
            className={`${clases(m)}${m.visibilidad === 'bambu' ? ' interna' : ''}${seguido(m, i) ? ' seguido' : ''}`}
          >
            {seguido(m, i) ? null : (
              <div className="cabecera-mensaje">
                <strong>{m.autor ?? t('hilo.sistema')}</strong>
                {m.visibilidad === 'bambu' ? <span className="chip atencion"><Lock size={12} aria-hidden /> {t('hilo.esNotaInterna')}</span> : null}
                <time>{haceCuanto(m.creado)}</time>
              </div>
            )}
            {m.tipo === 'adjunto' ? (
              m.adjunto_retirado ? <p className="texto-tenue">{t('hilo.retirado')}: {m.adjunto_nombre}</p> : (
                <div className="adjunto">
                  <a href={`/api/adjuntos/${m.adjunto_id}/fichero`} target="_blank" rel="noopener" className="adjunto-enlace" title={t('hilo.abrirAdjunto')}>
                    {m.adjunto_miniatura ? (
                      <img src={`/api/adjuntos/${m.adjunto_id}/miniatura`} alt={m.adjunto_nombre ?? ''} loading="lazy" />
                    ) : (
                      <span className="adjunto-icono"><FileText size={22} aria-hidden /></span>
                    )}
                    <span>
                      <b>{m.adjunto_nombre}</b>
                      <small>
                        {m.adjunto_categoria ? <span className="chip">{t(CHIP_CATEGORIA[m.adjunto_categoria])}</span> : null}
                        {tamano(m.adjunto_bytes)}
                      </small>
                    </span>
                  </a>
                  {puedeRetirar(m) ? (
                    <button type="button" className="boton-icono" aria-label={t('hilo.retirar')} onClick={() => void retirar(m)}>
                      <Trash2 size={16} aria-hidden />
                    </button>
                  ) : null}
                </div>
              )
            ) : m.tipo === 'informe' && m.informe_id ? (
              <Link to={`${bambu ? '/b' : '/d'}/casos/${casoId}/informes/${m.informe_id}`} className="adjunto-enlace tarjeta-informe">
                <span className="adjunto-icono"><FileText size={22} aria-hidden /></span>
                <span><b>{m.cuerpo}</b><small>{t('informes.ver')}</small></span>
              </Link>
            ) : <p className="cuerpo-mensaje">{m.cuerpo}</p>}
          </li>
        ))}
        {subidas.enCurso.map((s) => (
          <li key={s.clave} className={`mensaje propio ${bambu ? 'de-bambu' : 'de-veterinario'} subiendo`} aria-busy="true">
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
      {mensajeError ? <Aviso tipo="error">{mensajeError}</Aviso> : null}

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
        {preparados.length > 0 ? (
          <ul className="preparados" aria-label={t('hilo.preparados')}>
            {preparados.map((p) => (
              <li key={p.clave}>
                {p.vista ? <img src={p.vista} alt="" /> : <FileText size={18} aria-hidden />}
                <span>{p.fichero.name}</span>
                <button type="button" className="boton-icono" aria-label={t('hilo.quitarAdjunto', { nombre: p.fichero.name })} onClick={() => quitar(p.clave)}>
                  <X size={16} aria-hidden />
                </button>
              </li>
            ))}
          </ul>
        ) : null}
        <div className="acciones">
          <button type="button" className="boton-secundario" onClick={() => selector.current?.click()} title={t('hilo.adjuntarAyuda')}>
            <Paperclip size={18} aria-hidden /> {t('hilo.adjuntar')}
          </button>
          <input ref={selector} type="file" multiple accept={ACEPTADOS} hidden onChange={(e) => preparar(e.target.files)} />
          {bambu ? (
            <label className="casilla">
              <input type="checkbox" checked={interna} disabled={enviando} onChange={(e) => setInterna(e.target.checked)} />
              <span><Lock size={14} aria-hidden /> {t('hilo.notaInterna')}</span>
            </label>
          ) : null}
          <button type="button" className="boton" disabled={enviando || (!texto.trim() && preparados.length === 0)} onClick={() => void enviar()}>
            <Send size={18} aria-hidden /> {t('hilo.enviar')}
          </button>
        </div>
        <small className="texto-suave">{t('hilo.adjuntarAyuda')}</small>
      </div>
    </section>
  );
}
