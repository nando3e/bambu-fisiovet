// Datos de demostración para entornos de prueba: clínicas, veterinarios,
// fisios y derivaciones en todos los estados. Nunca pisa nada: se niega si
// ya hay casos o si la URL pública es la de producción.
//
//   npm run sembrar-demo            (usa el .env del API)
//
// Contraseña de todas las cuentas de demo: la de DEMO_CONTRASENA, o
// «demo-bambu-2026» si no está.
import pg from 'pg';
import { hashearContrasena } from '../src/auth/contrasena.ts';
import { aplicarMigraciones } from '../src/db/migraciones.ts';
import { crearPool, enTransaccion, type ClientePg } from '../src/db/pool.ts';

const URL_PRODUCCION = /bambufisiovet\.com/i;

export async function sembrarDemo(pool: pg.Pool, urlPublica: string, contrasena: string): Promise<string> {
  if (URL_PRODUCCION.test(urlPublica)) throw new Error('Esto es producción: la semilla de demo no se ejecuta aquí.');
  await aplicarMigraciones(pool);
  const { rows } = await pool.query<{ n: number }>('SELECT count(*)::int AS n FROM casos');
  if (rows[0]!.n > 0) throw new Error('Ya hay casos: la semilla de demo no pisa datos.');
  const hash = await hashearContrasena(contrasena);

  return enTransaccion(pool, async (bd) => {
    const clinica = async (nombre: string, poblacion: string) =>
      (await bd.query<{ id: number }>(
        'INSERT INTO clinicas (nombre, poblacion, validada) VALUES ($1, $2, true) RETURNING id', [nombre, poblacion],
      )).rows[0]!.id;
    const usuario = async (email: string, nombre: string, apellidos: string, rol: 'bambu' | 'derivador', clinicaId: number | null) =>
      (await bd.query<{ id: number }>(
        `INSERT INTO usuarios (email, nombre, apellidos, rol, clinica_id, contrasena_hash, verificado_el,
                               privacidad_version, privacidad_el)
         VALUES ($1, $2, $3, $4, $5, $6, now(), 'demo', now()) RETURNING id`,
        [email, nombre, apellidos, rol, clinicaId, hash],
      )).rows[0]!.id;

    const santRoc = await clinica('Clínica Veterinària Sant Roc', 'Dénia');
    const montgo = await clinica('Hospital Veterinari Montgó', 'Xàbia');
    const marina = await clinica('Centre Veterinari La Marina', 'Pedreguer');
    const vets = [
      await usuario('marta@santroc.demo', 'Marta', 'Puig', 'derivador', santRoc),
      await usuario('pau@santroc.demo', 'Pau', 'Vidal', 'derivador', santRoc),
      await usuario('anna@montgo.demo', 'Anna', 'Soler', 'derivador', montgo),
      await usuario('biel@marina.demo', 'Biel', 'Ferrer', 'derivador', marina),
    ];
    const clinicaDe = [santRoc, santRoc, montgo, marina];
    const laia = await usuario('laia@bambu.demo', 'Laia', 'Serra', 'bambu', null);
    const jordi = await usuario('jordi@bambu.demo', 'Jordi', 'Mas', 'bambu', null);

    const pacientes: [string, string, string, string][] = [
      ['Nala', 'perro', 'Joan Llopis', 'Coixesa posterior dreta després de TPLO'],
      ['Thor', 'perro', 'Rosa Bertomeu', 'Hèrnia discal T13-L1 operada, paraparèsia'],
      ['Mixa', 'gato', 'Carme Ivars', 'Rigidesa per artrosi de maluc'],
      ['Kira', 'perro', 'Toni Sendra', 'Displàsia de colze bilateral'],
      ['Rufo', 'perro', 'Lluïsa Giner', 'Recuperació de fractura de fèmur'],
      ['Lola', 'conejo', 'Pere Ortolà', 'Debilitat del tercer posterior'],
      ['Bruc', 'perro', 'Neus Fornés', 'Sobrepès i artrosi, pla de control'],
      ['Pelut', 'gato', 'Vicent Ronda', 'Lesió del plexe braquial'],
    ];
    const estados = ['borrador', 'enviada', 'enviada', 'aceptada', 'aceptada', 'en_tratamiento', 'en_tratamiento',
      'en_tratamiento', 'alta', 'alta', 'rechazada', 'abandonada', 'enviada', 'aceptada', 'en_tratamiento'];

    const crearPaciente = async (bd2: ClientePg, i: number, clinicaId: number, autor: number) => {
      const [nombre, especie, propietario] = pacientes[i % pacientes.length]!;
      const { rows: pr } = await bd2.query<{ id: number }>(
        `INSERT INTO propietarios (nombre, telefono, clinica_origen_id, creado_por, consentimiento_version,
                                   consentimiento_texto, consentimiento_el)
         VALUES ($1, $2, $3, $4, 1, 'Consentiment de demo', now()) RETURNING id`,
        [propietario, `6${String(10000000 + i * 1234567).slice(0, 8)}`, clinicaId, autor],
      );
      return (await bd2.query<{ id: number }>(
        `INSERT INTO pacientes (nombre, especie, peso_kg, propietario_id, clinica_origen_id, creado_por)
         VALUES ($1, $2, $3, $4, $5, $6) RETURNING id`,
        [nombre, especie, especie === 'perro' ? 12 + i : 4, pr[0]!.id, clinicaId, autor],
      )).rows[0]!.id;
    };

    let primerPaciente = 0;
    for (const [i, estado] of estados.entries()) {
      const v = i % vets.length;
      const registrada = i === 4 || i === 13;
      const autor = registrada ? laia : vets[v]!;
      // El último reutiliza el paciente del primero ya enviado: derivado dos veces.
      const pacienteId = i === estados.length - 1 ? primerPaciente : await crearPaciente(bd, i, clinicaDe[v]!, autor);
      if (i === 1) primerPaciente = pacienteId;
      const dias = 30 - i * 2;
      const enviado = estado === 'borrador' ? null : `now() - interval '${dias} days'`;
      const resuelto = ['borrador', 'enviada'].includes(estado) ? null : `now() - interval '${dias - 1} days'`;
      await bd.query(
        `INSERT INTO casos (paciente_id, clinica_id, derivador_id, derivador_nombre, registrado_por, creado_por, estado,
                            fisio_responsable_id, motivo, historia_clinica, objetivos,
                            enviado_el, resuelto_el, en_tratamiento_el, primera_visita, cerrado_el, motivo_cierre,
                            ultima_actividad, creado)
         VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9, $10, $11,
                 ${enviado ?? 'NULL'}, ${resuelto ?? 'NULL'},
                 ${['en_tratamiento', 'alta'].includes(estado) ? `now() - interval '${dias - 3} days'` : 'NULL'},
                 ${['en_tratamiento', 'alta'].includes(estado) ? `(now() - interval '${dias - 4} days')::date` : 'NULL'},
                 ${['alta', 'rechazada', 'abandonada'].includes(estado) ? `now() - interval '${Math.max(dias - 10, 1)} days'` : 'NULL'},
                 $12, now() - interval '${Math.max(dias - 5, 0)} days', now() - interval '${dias} days')`,
        [pacienteId, clinicaDe[v], registrada ? null : vets[v], registrada ? 'Dr. Andreu Climent' : null,
          registrada ? laia : null, autor, estado, ['borrador', 'enviada'].includes(estado) ? null : (i % 2 ? laia : jordi),
          pacientes[i % pacientes.length]![3], 'Sense altres patologies rellevants.', 'Recuperar la funcionalitat i reduir el dolor.',
          estado === 'rechazada' ? 'Cas quirúrgic: cal valoració de traumatologia abans.'
            : estado === 'abandonada' ? 'El propietari no contesta.' : null],
      );
    }
    return `Demo sembrada: 3 clínicas, 4 veterinarios, 2 fisios (laia@bambu.demo, jordi@bambu.demo), ${estados.length} casos. Contraseña: la de DEMO_CONTRASENA o la de serie.`;
  });
}

// Solo al ejecutarlo como script, no al importarlo desde un test.
if (process.argv[1]?.replace(/\\/g, '/').endsWith('seed/demo.ts')) {
  const url = process.env.DATABASE_URL;
  if (!url) throw new Error('Falta DATABASE_URL');
  const pool = crearPool(url);
  sembrarDemo(pool, process.env.URL_PUBLICA ?? '', process.env.DEMO_CONTRASENA ?? 'demo-bambu-2026')
    .then((m) => console.log(m))
    .catch((e) => {
      console.error((e as Error).message);
      process.exitCode = 1;
    })
    .finally(() => pool.end());
}
