// Pacientes: /d/pacients y /b/pacients, y la ficha de cada uno con todas sus
// derivaciones (un paciente puede derivarse más de una vez).
import { useEffect, useState } from 'react';
import { Link, useParams } from 'react-router';
import { ArrowLeft, PawPrint, Search } from 'lucide-react';
import { api, mensajeDe } from '../../api.ts';
import { fecha, t, type ClaveTexto } from '../../i18n/index.ts';
import { Aviso, Cargando, TituloPagina, Vacio } from '../../componentes/comunes.tsx';
import { ChipEstado, fechaCorta, nombreEspecie, type DatosPaciente, type DatosPropietario } from './comun.tsx';
import type { EstadoCaso } from '../../estados.ts';

interface PacienteLista {
  id: number;
  nombre: string;
  especie: string | null;
  especie_otra: string | null;
  raza: string | null;
  propietario: string;
  telefono: string | null;
  clinica: string | null;
  derivaciones: number;
}

export function ListaPacientes({ zona }: { zona: '/d' | '/b' }) {
  const [texto, setTexto] = useState('');
  const [pacientes, setPacientes] = useState<PacienteLista[] | null>(null);
  const [error, setError] = useState('');
  useEffect(() => {
    const espera = setTimeout(() => {
      const q = texto.trim() ? `?q=${encodeURIComponent(texto.trim())}` : '';
      api.get<{ pacientes: PacienteLista[] }>(`/pacientes${q}`).then((r) => setPacientes(r.pacientes)).catch((err) => setError(mensajeDe(err)));
    }, 300);
    return () => clearTimeout(espera);
  }, [texto]);

  return (
    <>
      <TituloPagina titulo={t('pacientes.titulo')} subtitulo={t('pacientes.subtitulo')} ayuda={zona === '/b' ? 'ayuda.pacientesB' : 'ayuda.pacientesD'} />
      <div className="barra-filtros">
        <label className="campo buscador">
          <span className="oculto">{t('pacientes.buscar')}</span>
          <Search size={18} aria-hidden />
          <input type="search" value={texto} placeholder={t('pacientes.buscar')} onChange={(e) => setTexto(e.target.value)} />
        </label>
      </div>
      {error ? <Aviso tipo="error">{error}</Aviso> : null}
      {!pacientes ? <Cargando /> : pacientes.length === 0 ? (
        <Vacio icono={<PawPrint size={32} aria-hidden />}>{t('pacientes.ninguno')}</Vacio>
      ) : (
        <ul className="lista">
          {pacientes.map((p) => (
            <li key={p.id}>
              <Link to={`${zona}/pacients/${p.id}`} className="fila-enlace">
                <span className="icono-fila"><PawPrint size={18} aria-hidden /></span>
                <div className="principal">
                  <strong>{p.nombre} · {nombreEspecie(p.especie, p.especie_otra)}</strong>
                  <span>{[p.propietario, p.telefono, zona === '/b' ? p.clinica : null].filter(Boolean).join(' · ')}</span>
                </div>
                <span className="chip gris">{t('pacientes.derivaciones', { n: p.derivaciones })}</span>
              </Link>
            </li>
          ))}
        </ul>
      )}
    </>
  );
}

interface FichaPaciente extends DatosPaciente {
  id: number;
  clinica: string | null;
  propietario: DatosPropietario & { id: number };
  casos: { id: number; estado: EstadoCaso; motivo: string; enviado_el: string | null; creado: string }[];
}

interface Cambio { id: number; antes: Record<string, unknown> | null; despues: Record<string, unknown> | null; cuando: string; usuario: string | null }

export function FichaPaciente({ zona }: { zona: '/d' | '/b' }) {
  const { id } = useParams();
  const [ficha, setFicha] = useState<FichaPaciente | null>(null);
  const [historial, setHistorial] = useState<Cambio[] | null>(null);
  const [error, setError] = useState('');
  useEffect(() => {
    api.get<FichaPaciente>(`/pacientes/${id}`).then(setFicha).catch((err) => setError(mensajeDe(err)));
    if (zona === '/b') {
      api.get<{ historial: Cambio[] }>(`/pacientes/${id}/historial`).then((r) => setHistorial(r.historial)).catch(() => {});
    }
  }, [id, zona]);

  if (error) return <Aviso tipo="error">{error}</Aviso>;
  if (!ficha) return <Cargando />;
  const deriva = zona === '/d';
  return (
    <>
      <Link to={`${zona}/pacients`} className="volver"><ArrowLeft size={16} aria-hidden /> {t('pacientes.titulo')}</Link>
      <TituloPagina
        antetitulo={ficha.clinica ?? undefined}
        titulo={`${ficha.nombre} · ${nombreEspecie(ficha.especie, ficha.especie_otra)}`}
        subtitulo={[ficha.raza, ficha.sexo ? t(`sexo.${ficha.sexo}` as ClaveTexto) : null,
          fechaCorta(ficha.fecha_nacimiento) || ficha.edad_texto,
          ficha.peso_kg === null ? null : `${String(ficha.peso_kg).replace('.', ',')} kg`].filter(Boolean).join(' · ')}
      />
      <section className="tarjeta">
        <h2>{t('caso.propietario')}</h2>
        <p>
          {ficha.propietario.nombre}
          {ficha.propietario.telefono ? <> · <a href={`tel:${ficha.propietario.telefono}`}>{ficha.propietario.telefono}</a></> : null}
          {ficha.propietario.email ? ` · ${ficha.propietario.email}` : ''}
        </p>
      </section>
      <section className="tarjeta">
        <h2>{t('menu.derivaciones')}</h2>
        <ul className="lista">
          {ficha.casos.map((c) => (
            <li key={c.id}>
              <Link to={`${zona}/casos/${c.id}`} className="fila-enlace">
                <div className="principal">
                  <strong>{fecha(c.enviado_el ?? c.creado)}</strong>
                  <span>{c.motivo.length > 90 ? `${c.motivo.slice(0, 90)}…` : c.motivo}</span>
                </div>
                <ChipEstado estado={c.estado} paraDerivador={deriva} />
              </Link>
            </li>
          ))}
        </ul>
      </section>
      {historial && historial.length > 0 ? (
        <section className="tarjeta">
          <h2>{t('caso.historial')}</h2>
          <ul className="lista historial">
            {historial.map((c) => (
              <li key={c.id}>
                <div className="principal">
                  <strong>{Object.keys(c.despues ?? {}).join(', ')}</strong>
                  <span>{Object.entries(c.despues ?? {}).map(([k, v]) => `${k}: ${String(c.antes?.[k] ?? '—')} → ${String(v ?? '—')}`).join(' · ')}</span>
                  <span>{[c.usuario, fecha(c.cuando)].filter(Boolean).join(' · ')}</span>
                </div>
              </li>
            ))}
          </ul>
        </section>
      ) : null}
    </>
  );
}
