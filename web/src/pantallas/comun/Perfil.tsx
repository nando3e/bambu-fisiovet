// Perfil: datos, contraseña, avisos por correo y, para el veterinario, su
// clínica (compañeros e invitar).
import { useCallback, useEffect, useState, type FormEvent } from 'react';
import { Building2, KeyRound, LogOut, Mail, UserPlus } from 'lucide-react';
import { api, mensajeDe, type Usuario } from '../../api.ts';
import { t } from '../../i18n/index.ts';
import { useSesion } from '../../sesion.tsx';
import { Aviso, Campo, Interruptor, TituloPagina } from '../../componentes/comunes.tsx';

export function Perfil() {
  const { usuario, salir } = useSesion();
  if (!usuario) return null;
  return (
    <>
      <TituloPagina antetitulo={t('perfil.antetitulo')} titulo={`${usuario.nombre} ${usuario.apellidos}`.trim()} subtitulo={usuario.email ?? undefined} />
      {usuario.es_de_entorno ? (
        <Aviso tipo="info">{t('perfil.superadmin')}</Aviso>
      ) : (
        <>
          <DatosPersonales usuario={usuario} />
          {usuario.rol === 'derivador' ? <CorreosAvisos usuario={usuario} /> : null}
          {usuario.rol === 'derivador' ? <MiClinica /> : null}
          <CambioContrasena />
        </>
      )}
      <button type="button" className="boton-secundario" onClick={() => void salir()}>
        <LogOut size={18} aria-hidden /> {t('perfil.salir')}
      </button>
    </>
  );
}

function DatosPersonales({ usuario }: { usuario: Usuario }) {
  const { fijar } = useSesion();
  const [d, setD] = useState({
    nombre: usuario.nombre,
    apellidos: usuario.apellidos,
    telefono: usuario.telefono ?? '',
    num_colegiado: usuario.num_colegiado ?? '',
  });
  const [estado, setEstado] = useState<{ ok?: string; error?: string }>({});

  async function guardar(e: FormEvent) {
    e.preventDefault();
    setEstado({});
    try {
      fijar(await api.patch<Usuario>('/auth/perfil', d));
      setEstado({ ok: t('comun.guardado') });
    } catch (err) {
      setEstado({ error: mensajeDe(err) });
    }
  }

  return (
    <section className="tarjeta">
      <h2>{t('perfil.datos')}</h2>
      <form className="formulario dos" onSubmit={guardar}>
        {estado.ok ? <div className="entero"><Aviso>{estado.ok}</Aviso></div> : null}
        {estado.error ? <div className="entero"><Aviso tipo="error">{estado.error}</Aviso></div> : null}
        <Campo etiqueta={t('alta.nombre')} value={d.nombre} onChange={(e) => setD({ ...d, nombre: e.target.value })} />
        <Campo etiqueta={t('alta.apellidos')} value={d.apellidos} onChange={(e) => setD({ ...d, apellidos: e.target.value })} />
        <Campo etiqueta={t('alta.telefono')} type="tel" value={d.telefono} onChange={(e) => setD({ ...d, telefono: e.target.value })} />
        {usuario.rol === 'derivador' ? (
          <Campo etiqueta={t('alta.colegiado')} value={d.num_colegiado} onChange={(e) => setD({ ...d, num_colegiado: e.target.value })} />
        ) : null}
        <div className="entero acciones">
          <button type="submit" className="boton">{t('comun.guardar')}</button>
        </div>
      </form>
    </section>
  );
}

function CorreosAvisos({ usuario }: { usuario: Usuario }) {
  const { fijar } = useSesion();
  const [error, setError] = useState('');
  return (
    <section className="tarjeta">
      {error ? <Aviso tipo="error">{error}</Aviso> : null}
      <div style={{ display: 'flex', gap: 14, alignItems: 'center', justifyContent: 'space-between' }}>
        <div>
          <h2 style={{ display: 'flex', gap: 8, alignItems: 'center' }}><Mail size={18} aria-hidden /> {t('perfil.correos')}</h2>
          <p className="texto-suave" style={{ margin: 0 }}>{t('perfil.correosAyuda')}</p>
        </div>
        <Interruptor
          etiqueta={t('perfil.correos')}
          marcado={usuario.recibe_correos}
          alCambiar={async (v) => {
            setError('');
            try {
              fijar(await api.patch<Usuario>('/auth/perfil', { recibe_correos: v }));
            } catch (err) {
              setError(mensajeDe(err));
            }
          }}
        />
      </div>
    </section>
  );
}

function CambioContrasena() {
  const [d, setD] = useState({ actual: '', nueva: '', repetida: '' });
  const [estado, setEstado] = useState<{ ok?: string; error?: string }>({});

  async function guardar(e: FormEvent) {
    e.preventDefault();
    setEstado({});
    if (d.nueva !== d.repetida) {
      setEstado({ error: t('enlace.noCoinciden') });
      return;
    }
    try {
      await api.post('/auth/cambia-contrasena', { actual: d.actual, nueva: d.nueva });
      setD({ actual: '', nueva: '', repetida: '' });
      setEstado({ ok: t('perfil.contrasenaCambiada') });
    } catch (err) {
      setEstado({ error: mensajeDe(err) });
    }
  }

  return (
    <section className="tarjeta">
      <h2 style={{ display: 'flex', gap: 8, alignItems: 'center' }}><KeyRound size={18} aria-hidden /> {t('perfil.contrasena')}</h2>
      <form className="formulario dos" onSubmit={guardar}>
        {estado.ok ? <div className="entero"><Aviso>{estado.ok}</Aviso></div> : null}
        {estado.error ? <div className="entero"><Aviso tipo="error">{estado.error}</Aviso></div> : null}
        <Campo className="entero" etiqueta={t('perfil.contrasenaActual')} type="password" autoComplete="current-password" value={d.actual} onChange={(e) => setD({ ...d, actual: e.target.value })} />
        <Campo etiqueta={t('enlace.contrasena')} type="password" autoComplete="new-password" value={d.nueva} onChange={(e) => setD({ ...d, nueva: e.target.value })} ayuda={t('enlace.contrasenaAyuda')} />
        <Campo etiqueta={t('enlace.repetir')} type="password" autoComplete="new-password" value={d.repetida} onChange={(e) => setD({ ...d, repetida: e.target.value })} />
        <div className="entero acciones">
          <button type="submit" className="boton" disabled={!d.actual || !d.nueva}>{t('perfil.cambiarContrasena')}</button>
        </div>
        <p className="entero texto-suave" style={{ fontSize: '0.85rem', margin: 0 }}>{t('perfil.contrasenaNota')}</p>
      </form>
    </section>
  );
}

interface DatosClinica {
  clinica: { id: number; nombre: string; poblacion: string | null; cif: string | null } | null;
  companeros: { id: number; nombre: string; apellidos: string; email: string; activo: boolean; verificado: boolean }[];
}

// A la clínica solo se entra por invitación: aquí se ven los compañeros y se
// invita a uno. El CIF se ve pero no se cambia (lo cambia Bambú).
function MiClinica() {
  const [datos, setDatos] = useState<DatosClinica | null>(null);
  const [estado, setEstado] = useState<{ ok?: string; error?: string }>({});
  const [invitado, setInvitado] = useState({ nombre: '', apellidos: '', email: '' });

  const cargar = useCallback(async () => {
    try {
      setDatos(await api.get<DatosClinica>('/clinicas/mia'));
    } catch (err) {
      setEstado({ error: mensajeDe(err) });
    }
  }, []);
  useEffect(() => {
    void cargar();
  }, [cargar]);

  async function invitar(e: FormEvent) {
    e.preventDefault();
    setEstado({});
    try {
      await api.post('/clinicas/mia/invitaciones', invitado);
      setInvitado({ nombre: '', apellidos: '', email: '' });
      setEstado({ ok: t('clinica.invitacionEnviada') });
      await cargar();
    } catch (err) {
      setEstado({ error: mensajeDe(err) });
    }
  }

  if (!datos) return null;
  return (
    <section className="tarjeta">
      <h2 style={{ display: 'flex', gap: 8, alignItems: 'center' }}><Building2 size={18} aria-hidden /> {datos.clinica?.nombre}</h2>
      {datos.clinica?.cif ? <p className="texto-suave" style={{ margin: '0 0 6px' }}>{t('clinica.cif', { cif: datos.clinica.cif })}</p> : null}
      <p className="ayuda texto-suave">{t('clinica.ayuda')}</p>
      {estado.ok ? <Aviso>{estado.ok}</Aviso> : null}
      {estado.error ? <Aviso tipo="error">{estado.error}</Aviso> : null}

      <h3 style={{ fontSize: '1rem', marginTop: 10 }}>{t('clinica.companeros')}</h3>
      <ul className="lista" style={{ marginBottom: 16 }}>
        {datos.companeros.map((c) => (
          <li key={c.id}>
            <div className="principal">
              <strong>{`${c.nombre} ${c.apellidos}`.trim()}</strong>
              <span>{c.email}</span>
            </div>
            {!c.verificado ? <span className="chip gris">{t('clinica.invitado')}</span> : null}
            {!c.activo ? <span className="chip error">{t('equipo.desactivado')}</span> : null}
          </li>
        ))}
      </ul>

      <h3 style={{ fontSize: '1rem' }}>{t('clinica.invitar')}</h3>
      <p className="texto-suave" style={{ fontSize: '0.88rem' }}>{t('clinica.invitarAyuda')}</p>
      <form className="formulario dos" onSubmit={invitar}>
        <Campo etiqueta={t('alta.nombre')} value={invitado.nombre} onChange={(e) => setInvitado({ ...invitado, nombre: e.target.value })} />
        <Campo etiqueta={t('alta.apellidos')} value={invitado.apellidos} onChange={(e) => setInvitado({ ...invitado, apellidos: e.target.value })} />
        <Campo className="entero" etiqueta={t('alta.email')} type="email" value={invitado.email} onChange={(e) => setInvitado({ ...invitado, email: e.target.value })} />
        <div className="entero acciones">
          <button type="submit" className="boton-secundario" disabled={!invitado.nombre || !invitado.email}>
            <UserPlus size={18} aria-hidden /> {t('clinica.enviarInvitacion')}
          </button>
        </div>
      </form>
    </section>
  );
}
