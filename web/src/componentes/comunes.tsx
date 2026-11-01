// Piezas pequeñas que usa toda la app.
import { useEffect, useRef, type InputHTMLAttributes, type ReactNode, type SelectHTMLAttributes, type TextareaHTMLAttributes } from 'react';
import { Link } from 'react-router';
import { AlertTriangle, CheckCircle2, Info, Loader2 } from 'lucide-react';
import { t, type ClaveTexto } from '../i18n/index.ts';

export function Marca({ a = '/', clara = false }: { a?: string; clara?: boolean }) {
  return (
    <Link to={a} className="marca" aria-label="BAMBÚ Fisiovet">
      <img src="/logo-bambu.png" alt="" width={40} height={40} />
      <span style={clara ? { color: 'var(--crema)' } : undefined}>
        <b>BAMBÚ</b>
        <small>FISIOVET</small>
      </span>
    </Link>
  );
}

export function Cargando({ texto }: { texto?: string }) {
  return (
    <div className="cargando" role="status">
      <div style={{ textAlign: 'center' }}>
        <Loader2 className="girando" size={28} aria-hidden />
        <p>{texto ?? t('comun.cargando')}</p>
      </div>
    </div>
  );
}

export function Aviso({ tipo = 'ok', children }: { tipo?: 'ok' | 'error' | 'atencion' | 'info'; children: ReactNode }) {
  const Icono = tipo === 'ok' ? CheckCircle2 : tipo === 'info' ? Info : AlertTriangle;
  const clase = tipo === 'ok' || tipo === 'info' ? 'aviso' : `aviso ${tipo}`;
  return (
    <div className={clase} role={tipo === 'error' ? 'alert' : 'status'}>
      <Icono size={18} aria-hidden />
      <div>{children}</div>
    </div>
  );
}

interface PropsCampo {
  etiqueta: string;
  error?: string | undefined;
  ayuda?: ReactNode;
  className?: string;
}

export function Campo({ etiqueta, error, ayuda, className, ...resto }: PropsCampo & InputHTMLAttributes<HTMLInputElement>) {
  return (
    <label className={`campo${error ? ' con-error' : ''}${className ? ` ${className}` : ''}`}>
      <span>{etiqueta}</span>
      <input aria-invalid={Boolean(error)} {...resto} />
      {error ? <span className="error-campo">{error}</span> : ayuda ? <small>{ayuda}</small> : null}
    </label>
  );
}

export function CampoTexto({ etiqueta, error, ayuda, className, ...resto }: PropsCampo & TextareaHTMLAttributes<HTMLTextAreaElement>) {
  return (
    <label className={`campo${error ? ' con-error' : ''}${className ? ` ${className}` : ''}`}>
      <span>{etiqueta}</span>
      <textarea aria-invalid={Boolean(error)} {...resto} />
      {error ? <span className="error-campo">{error}</span> : ayuda ? <small>{ayuda}</small> : null}
    </label>
  );
}

export function CampoSelector({ etiqueta, error, ayuda, className, children, ...resto }: PropsCampo & SelectHTMLAttributes<HTMLSelectElement>) {
  return (
    <label className={`campo${error ? ' con-error' : ''}${className ? ` ${className}` : ''}`}>
      <span>{etiqueta}</span>
      <select aria-invalid={Boolean(error)} {...resto}>{children}</select>
      {error ? <span className="error-campo">{error}</span> : ayuda ? <small>{ayuda}</small> : null}
    </label>
  );
}

export function Interruptor({ marcado, alCambiar, etiqueta, desactivado }: {
  marcado: boolean;
  alCambiar: (v: boolean) => void;
  etiqueta: string;
  desactivado?: boolean;
}) {
  return (
    <span className="interruptor">
      <input
        type="checkbox"
        role="switch"
        aria-label={etiqueta}
        checked={marcado}
        disabled={desactivado}
        onChange={(e) => alCambiar(e.target.checked)}
      />
      <span aria-hidden />
    </span>
  );
}

export function Vacio({ icono, children }: { icono: ReactNode; children: ReactNode }) {
  return (
    <div className="vacio">
      {icono}
      <div>{children}</div>
    </div>
  );
}

export function TituloPagina({ antetitulo, titulo, subtitulo, ayuda, ayudaTitulo, children }: {
  antetitulo?: string;
  titulo: string;
  subtitulo?: string;
  /** Texto del botón (i) junto al título: qué hay en la pantalla y qué se hace en ella. */
  ayuda?: ClaveTexto;
  /** Título del diálogo de ayuda, si no es el de la página. */
  ayudaTitulo?: string;
  children?: ReactNode;
}) {
  return (
    <div className="titulo-pagina">
      <div>
        {antetitulo ? <div className="antetitulo">{antetitulo}</div> : null}
        <h1>{titulo}{ayuda ? <Ayuda titulo={ayudaTitulo ?? titulo} texto={ayuda} /> : null}</h1>
        {subtitulo ? <p>{subtitulo}</p> : null}
      </div>
      {children}
    </div>
  );
}

/** Añade «visible» a los elementos .aparece cuando entran en pantalla. */
export function useAparecer(dependencia: unknown = null) {
  const raiz = useRef<HTMLDivElement>(null);
  useEffect(() => {
    const elementos = raiz.current?.querySelectorAll('.aparece') ?? [];
    if (!('IntersectionObserver' in window)) {
      elementos.forEach((e) => e.classList.add('visible'));
      return;
    }
    // Umbral 0: un bloque más alto que la pantalla del móvil nunca llegaría a
    // tener un porcentaje visible y se quedaría oculto.
    const observador = new IntersectionObserver(
      (entradas) =>
        entradas.forEach((e) => {
          if (e.isIntersecting) {
            e.target.classList.add('visible');
            observador.unobserve(e.target);
          }
        }),
      { threshold: 0 },
    );
    elementos.forEach((e) => observador.observe(e));
    return () => observador.disconnect();
  }, [dependencia]);
  return raiz;
}

/**
 * Botón (i) que abre una explicación en un diálogo nativo (Esc o tocar fuera
 * lo cierran). El texto va en el diccionario: una línea por párrafo, y una
 * línea que acaba en «:» es un subtítulo.
 */
export function Ayuda({ titulo, texto }: { titulo: string; texto: ClaveTexto }) {
  const dialogo = useRef<HTMLDialogElement>(null);
  const etiqueta = t('ayuda.abrir', { titulo });
  return (
    <>
      <button type="button" className="boton-info" aria-label={etiqueta} title={etiqueta} onClick={() => dialogo.current?.showModal()}>
        <Info size={18} aria-hidden />
      </button>
      <dialog ref={dialogo} className="dialogo-ayuda" onClick={(e) => { if (e.target === dialogo.current) dialogo.current.close(); }}>
        <div className="dialogo-ayuda-cuerpo">
          <h2>{titulo}</h2>
          {t(texto).split('\n').map((linea, i) => (linea.endsWith(':') ? <h3 key={i}>{linea.slice(0, -1)}</h3> : <p key={i}>{linea}</p>))}
          <div className="acciones">
            <button type="button" className="boton" onClick={() => dialogo.current?.close()}>{t('ayuda.entendido')}</button>
          </div>
        </div>
      </dialog>
    </>
  );
}
