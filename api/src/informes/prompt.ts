// Lo que viaja al modelo. Solo datos del paciente y del caso, los dictados del
// fisio y el informe anterior: ni propietario, ni veterinario, ni clínica
// (principio duro 4; un test lo vigila con un caso real). Las notas libres
// del veterinario tampoco van: pueden llevar nombres y teléfonos.
import type { TipoInforme } from './esquema.ts';

export interface ContextoInforme {
  tipo: TipoInforme;
  paciente: {
    nombre: string;
    especie: string | null;
    especie_otra: string | null;
    raza: string | null;
    sexo: string | null;
    esterilizado: boolean | null;
    fecha_nacimiento: string | null;
    edad_texto: string | null;
    peso_kg: number | null;
  };
  caso: { motivo: string; historia_clinica: string; tratamiento_actual: string; objetivos: string };
  transcripciones: { creado: string; texto: string }[];
  informeAnterior: string | null;
  instrucciones: string | null;
}

const TIPO: Record<TipoInforme, string> = {
  valoracion: 'informe de valoració inicial',
  evolucion: 'informe d’evolució',
  alta: 'informe d’alta',
};

export const SISTEMA = [
  'Ets un fisioterapeuta veterinari que redacta informes clínics per al veterinari que ha derivat el pacient.',
  'Redacta en valencià, amb to clínic, clar i breu.',
  'Fes servir només el que diuen les notes i les dades del cas: no inventes cap dada, mesura, freqüència ni data.',
  'Tot el que caldria saber i les notes no deixen clar va a «dudas», formulat com una pregunta curta; no ho omplis amb suposicions.',
  'Si un apartat no té informació a les notes, deixa’l buit (o null si és opcional).',
  'Els apartats estado_al_alta i pautas_domicilio només s’omplin en l’informe d’alta; en els altres, null.',
].join('\n');

const linea = (etiqueta: string, valor: unknown) =>
  valor === null || valor === undefined || valor === '' ? null : `${etiqueta}: ${String(valor)}`;

export function construirPrompt(c: ContextoInforme): { sistema: string; texto: string } {
  const p = c.paciente;
  const partes = [
    `Redacta un ${TIPO[c.tipo]}.`,
    '',
    '## Pacient',
    ...[
      linea('Nom', p.nombre),
      linea('Espècie', p.especie === 'otro' ? p.especie_otra : p.especie),
      linea('Raça', p.raza),
      linea('Sexe', p.sexo),
      linea('Esterilitzat', p.esterilizado === null ? null : p.esterilizado ? 'sí' : 'no'),
      linea('Data de naixement', p.fecha_nacimiento),
      linea('Edat', p.edad_texto),
      linea('Pes (kg)', p.peso_kg),
    ].filter(Boolean),
    '',
    '## Derivació',
    ...[
      linea('Motiu', c.caso.motivo),
      linea('Història clínica', c.caso.historia_clinica),
      linea('Tractament actual', c.caso.tratamiento_actual),
      linea('Objectius', c.caso.objetivos),
    ].filter(Boolean),
    '',
    '## Notes dictades pel fisioterapeuta',
    ...(c.transcripciones.length
      ? c.transcripciones.map((t) => `- (${t.creado.slice(0, 10)}) ${t.texto}`)
      : ['(Cap nota dictada. Posa a «dudas» tot el que calga per a l’informe.)']),
  ];
  if (c.informeAnterior) partes.push('', '## Informe anterior', c.informeAnterior);
  if (c.instrucciones) partes.push('', '## Indicacions del fisioterapeuta per a aquesta versió', c.instrucciones);
  return { sistema: SISTEMA, texto: partes.join('\n') };
}
