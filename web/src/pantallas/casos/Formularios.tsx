// Campos de paciente, propietario y derivación. Los usan el asistente de
// «Nova derivació» y la edición de la ficha. Los errores llegan del API con
// la ruta del campo («paciente.nombre», «caso.motivo»…).
import { useEffect, useState } from 'react';
import { t, type ClaveTexto } from '../../i18n/index.ts';
import { Campo, CampoSelector, CampoTexto } from '../../componentes/comunes.tsx';
import {
  ESPECIES, SEXOS, type DatosDerivacion, type DatosPaciente, type DatosPropietario,
} from './comun.tsx';

type Errores = Record<string, string>;

export const PACIENTE_VACIO: DatosPaciente = {
  nombre: '', especie: null, especie_otra: '', raza: '', sexo: null, esterilizado: null,
  fecha_nacimiento: null, edad_texto: '', peso_kg: null,
};
export const PROPIETARIO_VACIO: DatosPropietario = { nombre: '', telefono: '', email: '' };
export const DERIVACION_VACIA: DatosDerivacion = {
  motivo: '', historia_clinica: '', tratamiento_actual: '', objetivos: '', notas_derivador: '',
};

/** Lo que manda el formulario: el peso con coma o punto, vacíos como null. */
export function pacienteParaApi(p: DatosPaciente) {
  return {
    ...p,
    especie_otra: p.especie === 'otro' ? (p.especie_otra ?? '') : '',
    fecha_nacimiento: p.fecha_nacimiento || null,
  };
}

export function CamposPaciente({ valor, cambiar, errores = {}, bloqueado = false }: {
  valor: DatosPaciente;
  cambiar: (v: DatosPaciente) => void;
  errores?: Errores;
  bloqueado?: boolean;
}) {
  const poner = <K extends keyof DatosPaciente>(k: K, v: DatosPaciente[K]) => cambiar({ ...valor, [k]: v });
  return (
    <div className="formulario dos">
      <Campo etiqueta={t('caso.nombre')} value={valor.nombre} disabled={bloqueado}
        error={errores['paciente.nombre']} onChange={(e) => poner('nombre', e.target.value)} />
      <CampoSelector etiqueta={t('caso.especie')} value={valor.especie ?? ''} disabled={bloqueado}
        error={errores['paciente.especie']} onChange={(e) => poner('especie', e.target.value || null)}>
        <option value="">—</option>
        {ESPECIES.map((e) => <option key={e} value={e}>{t(`especie.${e}` as ClaveTexto)}</option>)}
      </CampoSelector>
      {valor.especie === 'otro' ? (
        <Campo etiqueta={t('caso.especieOtra')} value={valor.especie_otra ?? ''} disabled={bloqueado}
          error={errores['paciente.especie_otra']} onChange={(e) => poner('especie_otra', e.target.value)} />
      ) : null}
      <Campo etiqueta={t('caso.raza')} value={valor.raza ?? ''} disabled={bloqueado}
        onChange={(e) => poner('raza', e.target.value)} />
      <CampoSelector etiqueta={t('caso.sexo')} value={valor.sexo ?? ''} disabled={bloqueado}
        onChange={(e) => poner('sexo', e.target.value || null)}>
        <option value="">—</option>
        {SEXOS.map((x) => <option key={x} value={x}>{t(`sexo.${x}` as ClaveTexto)}</option>)}
      </CampoSelector>
      <CampoSelector etiqueta={t('caso.esterilizado')} disabled={bloqueado}
        value={valor.esterilizado === null ? '' : valor.esterilizado ? 'si' : 'no'}
        onChange={(e) => poner('esterilizado', e.target.value === '' ? null : e.target.value === 'si')}>
        <option value="">—</option>
        <option value="si">{t('caso.si')}</option>
        <option value="no">{t('caso.no')}</option>
      </CampoSelector>
      <Campo etiqueta={t('caso.fechaNacimiento')} type="date" value={valor.fecha_nacimiento ?? ''} disabled={bloqueado}
        error={errores['paciente.fecha_nacimiento']} onChange={(e) => poner('fecha_nacimiento', e.target.value || null)} />
      <Campo etiqueta={t('caso.edad')} value={valor.edad_texto ?? ''} disabled={bloqueado}
        onChange={(e) => poner('edad_texto', e.target.value)} />
      <CampoPeso valor={valor.peso_kg} cambiar={(n) => poner('peso_kg', n)} error={errores['paciente.peso_kg']} bloqueado={bloqueado} />
    </div>
  );
}

/** El peso con su propio texto: así se puede escribir «12,» antes del decimal. */
function CampoPeso({ valor, cambiar, error, bloqueado }: {
  valor: number | null;
  cambiar: (n: number | null) => void;
  error?: string | undefined;
  bloqueado: boolean;
}) {
  const aTexto = (n: number | null) => (n === null ? '' : String(n).replace('.', ','));
  const [texto, setTexto] = useState(aTexto(valor));
  const leer = (x: string) => {
    const bruto = x.replace(',', '.').trim();
    const n = Number(bruto);
    return bruto === '' || Number.isNaN(n) ? null : n;
  };
  // Si el valor cambia desde fuera (al cargar la ficha), se refleja.
  useEffect(() => {
    if (leer(texto) !== valor) setTexto(aTexto(valor));
    // Solo cuando cambia el valor de fuera.
  }, [valor]);
  return (
    <Campo etiqueta={t('caso.peso')} inputMode="decimal" disabled={bloqueado} value={texto} error={error}
      onChange={(e) => {
        setTexto(e.target.value);
        cambiar(leer(e.target.value));
      }} />
  );
}

export function CamposPropietario({ valor, cambiar, errores = {}, soloContacto = false, bloqueado = false }: {
  valor: DatosPropietario;
  cambiar: (v: DatosPropietario) => void;
  errores?: Errores;
  soloContacto?: boolean;
  bloqueado?: boolean;
}) {
  return (
    <div className="formulario dos">
      <Campo etiqueta={t('caso.nombre')} value={valor.nombre} disabled={bloqueado || soloContacto}
        error={errores['propietario.nombre']} onChange={(e) => cambiar({ ...valor, nombre: e.target.value })} />
      <Campo etiqueta={t('caso.telefono')} type="tel" autoComplete="off" value={valor.telefono ?? ''} disabled={bloqueado}
        error={errores['propietario.telefono']} onChange={(e) => cambiar({ ...valor, telefono: e.target.value })} />
      <Campo etiqueta={t('caso.email')} type="email" autoComplete="off" value={valor.email ?? ''} disabled={bloqueado}
        error={errores['propietario.email']} onChange={(e) => cambiar({ ...valor, email: e.target.value })} />
    </div>
  );
}

export function CamposDerivacion({ valor, cambiar, errores = {} }: {
  valor: DatosDerivacion;
  cambiar: (v: DatosDerivacion) => void;
  errores?: Errores;
}) {
  const campo = (k: keyof DatosDerivacion, etiqueta: ClaveTexto, filas: number) => (
    <CampoTexto etiqueta={t(etiqueta)} rows={filas} value={valor[k]} error={errores[`caso.${k}`]}
      onChange={(e) => cambiar({ ...valor, [k]: e.target.value })} />
  );
  return (
    <div className="formulario">
      {campo('motivo', 'caso.motivo', 4)}
      {campo('historia_clinica', 'caso.historia', 4)}
      {campo('tratamiento_actual', 'caso.tratamiento', 3)}
      {campo('objetivos', 'caso.objetivos', 2)}
      {campo('notas_derivador', 'caso.notas', 2)}
    </div>
  );
}
