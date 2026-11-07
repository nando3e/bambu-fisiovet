// Los documentos del caso agrupados por categoría (radiografies, informes,
// analítiques y los que entraron por el hilo), con miniatura, botón de añadir
// por categoría y retirar. Son los mismos adjuntos del hilo, vistos por tipo.
// Se usa en el paso 2 de la nova derivació (desde el borrador) y en la ficha.
import { useCallback, useEffect, useRef, useState } from 'react';
import { FileText, Plus, Trash2 } from 'lucide-react';
import { api, mensajeDe } from '../../api.ts';
import { t, type ClaveTexto } from '../../i18n/index.ts';
import { useSesion } from '../../sesion.tsx';
import { Aviso } from '../../componentes/comunes.tsx';
import { ACEPTADOS, tamano } from '../../imagenes.ts';
import { useSubidas, type Subidas } from '../../subidas.ts';
import type { EstadoCaso } from '../../estados.ts';

export const CATEGORIAS = ['radiografia', 'informe', 'analitica'] as const;
export type Categoria = (typeof CATEGORIAS)[number];

export interface Adjunto {
  id: number;
  nombre: string;
  mime: string;
  bytes: number;
  miniatura: boolean;
  categoria: Categoria | null;
  subido_por: number;
  creado: string;
  visibilidad: 'todos' | 'bambu';
  autor: string | null;
}

const ETIQUETA: Record<Categoria | 'altres', ClaveTexto> = {
  radiografia: 'doc.radiografia', informe: 'doc.informe', analitica: 'doc.analitica', altres: 'doc.altres',
};
const MINUTOS_RETIRAR = 15;
/** Hasta cuándo puede añadir documentos el veterinario (después, lo que haga falta va por el hilo). */
const ANADE_DERIVADOR: EstadoCaso[] = ['borrador', 'enviada', 'aceptada', 'en_tratamiento'];

export function Documentos({ casoId, estado, deriva, subidas: externas, enFormulario = false }: {
  casoId: number;
  estado: EstadoCaso;
  deriva: boolean;
  /** La fila de subidas de quien manda (la nova derivació espera a que acabe); si no, la propia. */
  subidas?: Subidas;
  /** En el formulario: sin «Altres», sin título grande, con la ayuda corta. */
  enFormulario?: boolean;
}) {
  const { usuario } = useSesion();
  const bambu = usuario?.rol === 'bambu' || usuario?.rol === 'superadmin';
  const [adjuntos, setAdjuntos] = useState<Adjunto[] | null>(null);
  const [error, setError] = useState('');

  const cargar = useCallback(async () => {
    const r = await api.get<{ adjuntos: Adjunto[] }>(`/casos/${casoId}/adjuntos`);
    setAdjuntos(r.adjuntos);
  }, [casoId]);
  const propias = useSubidas(cargar);
  const subidas = externas ?? propias;

  useEffect(() => {
    cargar().catch((err) => setError(mensajeDe(err)));
  }, [cargar]);
  // Cuando la fila la lleva otro (la nova derivació), al vaciarse se recarga.
  const subiendo = subidas.enCurso.length;
  useEffect(() => {
    if (externas && subiendo === 0) cargar().catch(() => {});
  }, [externas, subiendo, cargar]);

  const puedeAnadir = deriva ? ANADE_DERIVADOR.includes(estado) : estado !== 'borrador';
  const puedeRetirar = (a: Adjunto) => bambu
    || (a.subido_por === usuario?.id && Date.now() - new Date(a.creado).getTime() < MINUTOS_RETIRAR * 60_000);

  async function retirar(a: Adjunto) {
    if (!window.confirm(t('hilo.retirarSeguro', { nombre: a.nombre }))) return;
    try {
      await api.delete(`/adjuntos/${a.id}`);
      await cargar();
    } catch (err) {
      setError(mensajeDe(err));
    }
  }

  const grupos: (Categoria | 'altres')[] = enFormulario ? [...CATEGORIAS] : [...CATEGORIAS, 'altres'];
  const de = (g: Categoria | 'altres') => (adjuntos ?? []).filter((a) => (g === 'altres' ? a.categoria === null : a.categoria === g));
  const enCursoDe = (g: Categoria | 'altres') => subidas.enCurso.filter((s) => s.etiqueta === g);

  return (
    <section className={enFormulario ? 'documentos' : 'tarjeta documentos'}>
      {enFormulario ? <h2>{t('doc.titulo')}</h2> : <div className="cabecera-seccion"><h2>{t('doc.titulo')}</h2></div>}
      <p className="texto-suave">{puedeAnadir ? t(enFormulario ? 'doc.ayudaNova' : 'doc.ayuda') : t('doc.soloLectura')}</p>
      {error || subidas.error ? <Aviso tipo="error">{error || subidas.error}</Aviso> : null}
      {grupos.map((g) => {
        const lista = de(g);
        const enCurso = enCursoDe(g);
        if (g === 'altres' && lista.length === 0 && enCurso.length === 0) return null;
        return (
          <div key={g} className="grupo-documentos">
            <div className="cabecera-grupo">
              <h3>{t(ETIQUETA[g])} <span className="texto-tenue">{lista.length > 0 ? lista.length : ''}</span></h3>
              {puedeAnadir && g !== 'altres' ? (
                <BotonAnadir
                  etiqueta={t('doc.anadir', { grupo: t(ETIQUETA[g]) })}
                  onFicheros={(f) => {
                    subidas.limpiarError();
                    setError('');
                    void subidas.encolar(f, `/casos/${casoId}/adjuntos`, { categoria: g }, g);
                  }}
                />
              ) : null}
            </div>
            {lista.length === 0 && enCurso.length === 0 ? <p className="texto-tenue">{t('doc.vacio')}</p> : (
              <ul className="documentos-lista">
                {lista.map((a) => (
                  <li key={a.id}>
                    <a href={`/api/adjuntos/${a.id}/fichero`} target="_blank" rel="noopener" className="adjunto-enlace" title={t('hilo.abrirAdjunto')}>
                      {a.miniatura ? (
                        <img src={`/api/adjuntos/${a.id}/miniatura`} alt={a.nombre} loading="lazy" />
                      ) : (
                        <span className="adjunto-icono"><FileText size={22} aria-hidden /></span>
                      )}
                      <span>
                        <b>{a.nombre}</b>
                        <small>{[tamano(a.bytes), a.autor, a.visibilidad === 'bambu' ? t('hilo.esNotaInterna') : null].filter(Boolean).join(' · ')}</small>
                      </span>
                    </a>
                    {puedeRetirar(a) ? (
                      <button type="button" className="boton-icono" aria-label={t('hilo.retirar')} onClick={() => void retirar(a)}>
                        <Trash2 size={16} aria-hidden />
                      </button>
                    ) : null}
                  </li>
                ))}
                {enCurso.map((s) => (
                  <li key={s.clave} className="subiendo" aria-busy="true">
                    <span className="adjunto-enlace">
                      {s.vista ? <img src={s.vista} alt="" /> : <span className="adjunto-icono"><FileText size={22} aria-hidden /></span>}
                      <span><b>{s.nombre}</b><small>{t('hilo.subiendo')}</small></span>
                    </span>
                  </li>
                ))}
              </ul>
            )}
          </div>
        );
      })}
    </section>
  );
}

function BotonAnadir({ etiqueta, onFicheros }: { etiqueta: string; onFicheros: (f: File[]) => void }) {
  const selector = useRef<HTMLInputElement>(null);
  return (
    <>
      <button type="button" className="boton-secundario" onClick={() => selector.current?.click()}>
        <Plus size={16} aria-hidden /> {etiqueta}
      </button>
      <input
        ref={selector}
        type="file"
        multiple
        accept={ACEPTADOS}
        hidden
        onChange={(e) => {
          onFicheros(Array.from(e.target.files ?? []));
          e.target.value = '';
        }}
      />
    </>
  );
}
