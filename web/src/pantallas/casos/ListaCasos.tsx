// Lista de derivaciones: /d (las de la clínica del veterinario) y /b/casos
// (todas). Filtros en la URL, para que los contadores del inicio lleven a la
// lista ya filtrada.
import { useEffect, useState } from 'react';
import { Link, useSearchParams } from 'react-router';
import { AlertTriangle, ClipboardList, Info, PhoneCall, Plus, Search, Stethoscope } from 'lucide-react';
import { api, mensajeDe } from '../../api.ts';
import { haceCuanto, t, type ClaveTexto } from '../../i18n/index.ts';
import { useSesion } from '../../sesion.tsx';
import { Aviso, Cargando, TituloPagina, Vacio } from '../../componentes/comunes.tsx';
import { ChipEstado, nombreEspecie, type CasoLista } from './comun.tsx';

interface Filtro {
  clave: string;
  texto: ClaveTexto;
  /** Parámetros de la consulta que pone este filtro. */
  params: Record<string, string>;
}

const FILTROS_BAMBU: Filtro[] = [
  { clave: 'noves', texto: 'casos.filtro.noves', params: { estado: 'enviada' } },
  { clave: 'sin_abrir', texto: 'casos.filtro.sinAbrir', params: { sin_abrir: '1' } },
  { clave: 'pendientes', texto: 'casos.filtro.pendientes', params: { estado: 'aceptada' } },
  { clave: 'atascados', texto: 'casos.filtro.atascados', params: { atascados: '1' } },
  { clave: 'tratamiento', texto: 'casos.filtro.enTratamiento', params: { estado: 'en_tratamiento' } },
  { clave: 'cerradas', texto: 'casos.filtro.cerradas', params: { estado: 'alta,rechazada,abandonada' } },
  { clave: 'todas', texto: 'casos.filtro.todas', params: {} },
];

const FILTROS_DERIVADOR: Filtro[] = [
  { clave: 'todas', texto: 'casos.filtro.todas', params: {} },
  { clave: 'curso', texto: 'casos.filtro.enCurso', params: { estado: 'enviada,aceptada,en_tratamiento' } },
  { clave: 'borradores', texto: 'casos.filtro.borradores', params: { estado: 'borrador' } },
  { clave: 'cerradas', texto: 'casos.filtro.cerradas', params: { estado: 'alta,rechazada,abandonada' } },
];

export function ListaCasos({ zona }: { zona: '/d' | '/b' }) {
  const { usuario } = useSesion();
  const deriva = zona === '/d';
  const filtros = deriva ? FILTROS_DERIVADOR : FILTROS_BAMBU;
  const [url, setUrl] = useSearchParams();
  const filtro = filtros.find((f) => f.clave === url.get('f')) ?? filtros.find((f) => f.clave === 'todas')!;
  const novedades = url.get('novetats') === '1';
  const [texto, setTexto] = useState(url.get('q') ?? '');
  const [casos, setCasos] = useState<CasoLista[] | null>(null);
  const [siguiente, setSiguiente] = useState<string | null>(null);
  const [error, setError] = useState('');
  const [ayuda, setAyuda] = useState(false);

  const consulta = (antes?: string) => {
    const p = new URLSearchParams(filtro.params);
    if (novedades) p.set('novedades', '1');
    const q = url.get('q');
    if (q) p.set('q', q);
    // Desde el panel: las derivaciones de una clínica.
    const clinica = url.get('clinica');
    if (clinica) p.set('clinica_id', clinica);
    // Desde el inicio o el panel: los casos con una propuesta de informe por confirmar.
    if (url.get('propuestas') === '1') p.set('propuestas_pendientes', '1');
    if (antes) p.set('antes_de', antes);
    return `/casos?${p.toString()}`;
  };

  useEffect(() => {
    setCasos(null);
    api.get<{ casos: CasoLista[]; siguiente: string | null }>(consulta())
      .then((r) => {
        setCasos(r.casos);
        setSiguiente(r.siguiente);
      })
      .catch((err) => setError(mensajeDe(err)));
    // La consulta depende solo de la URL.
  }, [url]);

  // La búsqueda va a la URL medio segundo después de dejar de escribir.
  useEffect(() => {
    const espera = setTimeout(() => {
      if ((url.get('q') ?? '') === texto.trim()) return;
      const nueva = new URLSearchParams(url);
      if (texto.trim()) nueva.set('q', texto.trim());
      else nueva.delete('q');
      setUrl(nueva, { replace: true });
    }, 500);
    return () => clearTimeout(espera);
  }, [texto, url, setUrl]);

  const cambiar = (cambios: Record<string, string | null>) => {
    const nueva = new URLSearchParams(url);
    for (const [k, v] of Object.entries(cambios)) {
      if (v === null) nueva.delete(k);
      else nueva.set(k, v);
    }
    setUrl(nueva, { replace: true });
  };

  async function cargarMas() {
    if (!siguiente) return;
    try {
      const r = await api.get<{ casos: CasoLista[]; siguiente: string | null }>(consulta(siguiente));
      setCasos((c) => [...(c ?? []), ...r.casos]);
      setSiguiente(r.siguiente);
    } catch (err) {
      setError(mensajeDe(err));
    }
  }

  const sinNada = casos?.length === 0 && filtro.clave === 'todas' && !novedades && !url.get('q') && !url.get('clinica') && !url.get('propuestas');

  return (
    <>
      <TituloPagina
        antetitulo={deriva ? usuario?.clinica?.nombre : undefined}
        titulo={deriva ? t('casos.tituloDerivador') : t('casos.titulo')}
        subtitulo={deriva ? t('casos.subtituloDerivador') : t('casos.subtitulo')}
      >
        {deriva ? (
          <Link to="/d/nova" className="boton oculto-movil"><Plus size={18} aria-hidden /> {t('casos.nueva')}</Link>
        ) : (
          <Link to="/b/casos/nou" className="boton-secundario"><PhoneCall size={18} aria-hidden /> {t('bambu.registrar')}</Link>
        )}
      </TituloPagina>

      <div className="fila-pestanas">
        <div className="pestanas" role="tablist">
          {filtros.map((f) => (
            <button
              key={f.clave}
              type="button"
              role="tab"
              aria-selected={f.clave === filtro.clave}
              className={f.clave === filtro.clave ? 'activo' : undefined}
              onClick={() => cambiar({ f: f.clave })}
            >
              {t(f.texto)}
            </button>
          ))}
        </div>
        {(
          <button
            type="button"
            className="boton-ayuda"
            aria-label={t('casos.ayuda.boton')}
            title={t('casos.ayuda.boton')}
            aria-expanded={ayuda}
            onClick={() => setAyuda((v) => !v)}
          >
            <Info size={20} aria-hidden />
          </button>
        )}
      </div>
      {ayuda ? <AyudaFiltros deriva={deriva} /> : null}

      <div className="barra-filtros">
        <label className="campo buscador">
          <span className="oculto">{t('casos.buscar')}</span>
          <Search size={18} aria-hidden />
          <input type="search" value={texto} placeholder={t('casos.buscar')} onChange={(e) => setTexto(e.target.value)} />
        </label>
        <label className="casilla">
          <input type="checkbox" checked={novedades} onChange={(e) => cambiar({ novetats: e.target.checked ? '1' : null })} />
          <span>{t('casos.filtro.novedades')}</span>
        </label>
      </div>

      {error ? <Aviso tipo="error">{error}</Aviso> : null}
      {!casos ? <Cargando /> : casos.length === 0 ? (
        sinNada && deriva ? <ComoFunciona /> : (
          <Vacio icono={<ClipboardList size={32} aria-hidden />}>{t('casos.ninguno')}</Vacio>
        )
      ) : (
        <ul className="lista">
          {casos.map((c) => (
            <li key={c.id} className={c.no_leidas > 0 ? 'no-leida' : undefined}>
              <Link to={`${zona}/casos/${c.id}`} className="fila-enlace">
                <div className="principal">
                  <strong>
                    {c.paciente || '—'}
                    {c.especie ? <span className="texto-suave"> · {nombreEspecie(c.especie, c.especie_otra)}</span> : null}
                  </strong>
                  <span>
                    {[deriva ? c.derivador : c.clinica, c.propietario, haceCuanto(c.ultima_actividad)].filter(Boolean).join(' · ')}
                  </span>
                </div>
                <span className="chips-fila">
                  {c.no_leidas > 0 ? <span className="punto" aria-label={t('casos.filtro.novedades')} /> : null}
                  {!deriva && c.estado === 'enviada' && !c.vista ? <span className="chip atencion">{t('casos.sinAbrir')}</span> : null}
                  {c.atascado ? <span className="chip error"><AlertTriangle size={13} aria-hidden /> {t('casos.atascado')}</span> : null}
                  {c.registrada ? <span className="chip gris"><PhoneCall size={13} aria-hidden /></span> : null}
                  <ChipEstado estado={c.estado} paraDerivador={deriva} />
                </span>
              </Link>
            </li>
          ))}
        </ul>
      )}
      {siguiente ? (
        <div className="acciones" style={{ justifyContent: 'center' }}>
          <button type="button" className="boton-secundario" onClick={() => void cargarMas()}>{t('casos.cargarMas')}</button>
        </div>
      ) : null}
      {deriva ? (
        <Link to="/d/nova" className="boton-flotante" aria-label={t('casos.nueva')}><Plus size={26} aria-hidden /></Link>
      ) : null}
    </>
  );
}

function ComoFunciona() {
  return (
    <section className="tarjeta">
      <h2 style={{ display: 'flex', gap: 8, alignItems: 'center' }}><Stethoscope size={18} aria-hidden /> {t('derivador.comoFunciona')}</h2>
      <p className="texto-suave">{t('casos.vacioDerivador')}</p>
      <ol style={{ paddingLeft: 20, margin: '0 0 16px', color: 'var(--texto-suave)' }}>
        <li>{t('derivador.paso1')}</li>
        <li>{t('derivador.paso2')}</li>
        <li>{t('derivador.paso3')}</li>
      </ol>
      <Link to="/d/nova" className="boton"><Plus size={18} aria-hidden /> {t('casos.nueva')}</Link>
    </section>
  );
}

/** Qué hay en cada pestaña y qué hay que hacer con ello (Bambú o el veterinario). */
function AyudaFiltros({ deriva }: { deriva: boolean }) {
  const [dias, setDias] = useState<number | null>(null);
  useEffect(() => {
    if (deriva) return;
    // Los días de «Encallades» son configurables: se leen de los contadores.
    api.get<{ dias_pendiente_cita: number }>('/panel/contadores')
      .then((r) => setDias(r.dias_pendiente_cita))
      .catch(() => setDias(null));
  }, [deriva]);
  const entradas = [...(deriva ? FILTROS_DERIVADOR : FILTROS_BAMBU).map((f) => ({ clave: f.clave, nombre: t(f.texto) })), { clave: 'novedades', nombre: t('casos.filtro.novedades') }];
  const prefijo = deriva ? 'casos.ayuda.d' : 'casos.ayuda';
  return (
    <section className="tarjeta ayuda-filtros">
      <h2>{t('casos.ayuda.titulo')}</h2>
      <dl>
        {entradas.map((e) => (
          <div key={e.clave}>
            <dt>{e.nombre}</dt>
            <dd>
              <p><strong>{t('casos.ayuda.hay')}:</strong> {t(`${prefijo}.${e.clave}.hay` as ClaveTexto, { n: dias ?? '…' })}</p>
              <p><strong>{t(deriva ? 'casos.ayuda.hacerD' : 'casos.ayuda.hacer')}:</strong> {t(`${prefijo}.${e.clave}.hacer` as ClaveTexto)}</p>
              {deriva ? null : <p><strong>{t('casos.ayuda.enciende')}:</strong> {t(`casos.ayuda.${e.clave}.enciende` as ClaveTexto, { n: dias ?? '…' })}</p>}
            </dd>
          </div>
        ))}
      </dl>
    </section>
  );
}
