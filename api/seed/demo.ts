// Datos de demostración para entornos de prueba: clínicas, veterinarios,
// fisios, derivaciones en todos los estados y conversación en los hilos.
// Nunca pisa nada: solo inserta, se niega si ya se sembró o si la URL pública
// es la de producción.
//
//   npm run sembrar-demo            (usa el .env del API)
//
// En el contenedor del portal de pruebas:
//   DEMO_CORREO=... DEMO_CONTRASENA=... node --experimental-strip-types api/seed/demo.ts
//
// Contraseña de todas las cuentas de demo: la de DEMO_CONTRASENA, o
// «demo-bambu-2026» si no está. Con DEMO_CORREO (un buzón real), la primera
// veterinaria usa ese correo y el resto «usuario+nombre@dominio», para que
// los avisos lleguen a ese buzón en vez de rebotar.
import pg from 'pg';
import { hashearContrasena } from '../src/auth/contrasena.ts';
import { aplicarMigraciones } from '../src/db/migraciones.ts';
import { crearPool, enTransaccion, type ClientePg } from '../src/db/pool.ts';

const URL_PRODUCCION = /bambufisiovet\.com/i;

export async function sembrarDemo(pool: pg.Pool, urlPublica: string, contrasena: string, correo?: string): Promise<string> {
  if (URL_PRODUCCION.test(urlPublica)) throw new Error('Esto es producción: la semilla de demo no se ejecuta aquí.');
  await aplicarMigraciones(pool);
  const [buzon, dominio] = (correo ?? '').split('@');
  const correoDe = (nombre: string, dominioDemo: string, principal = false) =>
    !correo ? `${nombre}@${dominioDemo}` : principal ? correo : `${buzon}+${nombre}@${dominio}`;
  const cuentas = [
    correoDe('marta', 'santroc.demo', true), correoDe('pau', 'santroc.demo'), correoDe('anna', 'montgo.demo'),
    correoDe('biel', 'marina.demo'), correoDe('laia', 'bambu.demo'), correoDe('jordi', 'bambu.demo'),
  ];
  const { rows } = await pool.query<{ n: number }>('SELECT count(*)::int AS n FROM usuarios WHERE lower(email) = ANY($1)', [cuentas]);
  if (rows[0]!.n > 0) throw new Error('La demo ya está sembrada: la semilla de demo no pisa datos.');
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
      await usuario(cuentas[0]!, 'Marta', 'Puig', 'derivador', santRoc),
      await usuario(cuentas[1]!, 'Pau', 'Vidal', 'derivador', santRoc),
      await usuario(cuentas[2]!, 'Anna', 'Soler', 'derivador', montgo),
      await usuario(cuentas[3]!, 'Biel', 'Ferrer', 'derivador', marina),
    ];
    const clinicaDe = [santRoc, santRoc, montgo, marina];
    const laia = await usuario(cuentas[4]!, 'Laia', 'Serra', 'bambu', null);
    const jordi = await usuario(cuentas[5]!, 'Jordi', 'Mas', 'bambu', null);
    const casos: { id: number; estado: string; vet: number | null; fisio: number | null; dias: number }[] = [];

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
      const { rows: creado } = await bd.query<{ id: number }>(
        `INSERT INTO casos (paciente_id, clinica_id, derivador_id, derivador_nombre, registrado_por, creado_por, estado,
                            fisio_responsable_id, motivo, historia_clinica, objetivos,
                            enviado_el, resuelto_el, en_tratamiento_el, primera_visita, cerrado_el, motivo_cierre,
                            ultima_actividad, creado)
         VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9, $10, $11,
                 ${enviado ?? 'NULL'}, ${resuelto ?? 'NULL'},
                 ${['en_tratamiento', 'alta'].includes(estado) ? `now() - interval '${dias - 3} days'` : 'NULL'},
                 ${['en_tratamiento', 'alta'].includes(estado) ? `(now() - interval '${dias - 4} days')::date` : 'NULL'},
                 ${['alta', 'rechazada', 'abandonada'].includes(estado) ? `now() - interval '${Math.max(dias - 10, 1)} days'` : 'NULL'},
                 $12, now() - interval '${Math.max(dias - 5, 0)} days', now() - interval '${dias} days')
         RETURNING id`,
        [pacienteId, clinicaDe[v], registrada ? null : vets[v], registrada ? 'Dr. Andreu Climent' : null,
          registrada ? laia : null, autor, estado, ['borrador', 'enviada'].includes(estado) ? null : (i % 2 ? laia : jordi),
          pacientes[i % pacientes.length]![3], 'Sense altres patologies rellevants.', 'Recuperar la funcionalitat i reduir el dolor.',
          estado === 'rechazada' ? 'Cas quirúrgic: cal valoració de traumatologia abans.'
            : estado === 'abandonada' ? 'El propietari no contesta.' : null],
      );
      casos.push({
        id: creado[0]!.id, estado, vet: registrada ? null : vets[v]!, dias,
        fisio: ['borrador', 'enviada'].includes(estado) ? null : (i % 2 ? laia : jordi),
      });
    }

    // Conversación en los hilos: lo que se ve al abrir un caso en marcha.
    const mensaje = async (casoId: number, autor: number | null, cuerpo: string, hace: number, visibilidad = 'todos') =>
      bd.query(
        `INSERT INTO mensajes (caso_id, autor_id, tipo, visibilidad, cuerpo, creado)
         VALUES ($1, $2, $3, $4, $5, now() - make_interval(hours => $6))`,
        [casoId, autor, autor ? 'texto' : 'sistema', visibilidad, cuerpo, hace],
      );
    let mensajes = 0;
    for (const c of casos) {
      if (c.estado === 'borrador') continue;
      const h = c.dias * 24;
      if (c.vet) {
        await mensaje(c.id, c.vet, 'Hola! Us passe aquest cas. El propietari prefereix que el telefoneu per la vesprada.', h - 1);
        mensajes++;
      }
      if (['aceptada', 'en_tratamiento', 'alta', 'abandonada'].includes(c.estado) && c.fisio) {
        await mensaje(c.id, c.fisio, 'Rebut, gràcies. Li telefonem esta setmana per a donar-li cita.', h - 20);
        mensajes++;
      }
      if (['en_tratamiento', 'alta'].includes(c.estado) && c.fisio) {
        await mensaje(c.id, c.fisio, 'Primera visita feta: tolera bé l’exercici a l’aigua. Seguim dos dies per setmana.', h - 80);
        await mensaje(c.id, c.fisio, 'Nota interna: revisar amb el veterinari si manté l’antiinflamatori.', h - 81, 'bambu');
        mensajes += 2;
        if (c.vet) {
          await mensaje(c.id, c.vet, 'Perfecte. Manté l’antiinflamatori una setmana més i després el retirem.', h - 90);
          mensajes++;
        }
      }
    }
    return `Demo sembrada: 3 clínicas, 4 veterinarios (${cuentas[0]} y ${cuentas.slice(1, 4).join(', ')}), 2 fisios (${cuentas[4]}, ${cuentas[5]}), ${estados.length} casos y ${mensajes} mensajes. Contraseña: la de DEMO_CONTRASENA o la de serie.`;
  });
}

// Solo al ejecutarlo como script, no al importarlo desde un test.
if (process.argv[1]?.replace(/\\/g, '/').endsWith('seed/demo.ts')) {
  const url = process.env.DATABASE_URL;
  if (!url) throw new Error('Falta DATABASE_URL');
  const pool = crearPool(url);
  sembrarDemo(pool, process.env.URL_PUBLICA ?? '', process.env.DEMO_CONTRASENA ?? 'demo-bambu-2026', process.env.DEMO_CORREO || undefined)
    .then((m) => console.log(m))
    .catch((e) => {
      console.error((e as Error).message);
      process.exitCode = 1;
    })
    .finally(() => pool.end());
}
