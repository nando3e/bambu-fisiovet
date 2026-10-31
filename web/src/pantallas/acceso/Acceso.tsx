// Una sola puerta para todos: entrar (veterinarios y Bambú) o crear un compte
// (solo veterinarios). Tras entrar, cada rol va a su zona.
import { useEffect, useState, type FormEvent } from 'react';
import { Link, Navigate, useNavigate, useSearchParams } from 'react-router';
import { ArrowLeft, Building2, Check, LogIn, UserPlus } from 'lucide-react';
import { api, ErrorApi, mensajeDe, type ClinicaSugerida, type Usuario } from '../../api.ts';
import { t } from '../../i18n/index.ts';
import { useSesion, zonaDe } from '../../sesion.tsx';
import { Aviso, Campo } from '../../componentes/comunes.tsx';

export function Acceso() {
  const { usuario } = useSesion();
  const [parametros, setParametros] = useSearchParams();
  const pestana = parametros.get('alta') === '1' ? 'alta' : 'entrar';

  if (usuario) return <Navigate to={zonaDe(usuario.rol)} replace />;

  return (
    <div className="pantalla-acceso">
      <div className={`caja-acceso${pestana === 'alta' ? ' ancha' : ''}`}>
        <img className="logo-acceso" src="/logo-bambu.png" alt="BAMBÚ Fisiovet" width={76} height={76} />
        <h1>{pestana === 'alta' ? t('acceso.altaTitulo') : t('acceso.titulo')}</h1>
        <p>{pestana === 'alta' ? t('acceso.altaSubtitulo') : t('acceso.subtitulo')}</p>
        <div className="pestanas" role="tablist">
          <button
            type="button"
            role="tab"
            aria-selected={pestana === 'entrar'}
            className={pestana === 'entrar' ? 'activo' : undefined}
            onClick={() => setParametros({})}
          >
            <LogIn size={16} aria-hidden /> {t('acceso.pestanaEntrar')}
          </button>
          <button
            type="button"
            role="tab"
            aria-selected={pestana === 'alta'}
            className={pestana === 'alta' ? 'activo' : undefined}
            onClick={() => setParametros({ alta: '1' })}
          >
            <UserPlus size={16} aria-hidden /> {t('acceso.pestanaAlta')}
          </button>
        </div>
        {pestana === 'entrar' ? <FormularioEntrar /> : <FormularioAlta />}
        <Link to="/" className="volver"><ArrowLeft size={16} aria-hidden /> {t('acceso.volverWeb')}</Link>
      </div>
    </div>
  );
}

function FormularioEntrar() {
  const { fijar } = useSesion();
  const navegar = useNavigate();
  const [identificador, setIdentificador] = useState('');
  const [contrasena, setContrasena] = useState('');
  const [error, setError] = useState('');
  const [enviando, setEnviando] = useState(false);

  async function enviar(e: FormEvent) {
    e.preventDefault();
    setError('');
    setEnviando(true);
    try {
      const u = await api.post<Usuario>('/auth/entrar', { identificador, contrasena });
      fijar(u);
      navegar(zonaDe(u.rol), { replace: true });
    } catch (err) {
      setError(mensajeDe(err));
    } finally {
      setEnviando(false);
    }
  }

  return (
    <form className="formulario" onSubmit={enviar} noValidate>
      {error ? <Aviso tipo="error">{error}</Aviso> : null}
      <Campo
        etiqueta={t('acceso.identificador')}
        autoComplete="username"
        inputMode="email"
        required
        value={identificador}
        onChange={(e) => setIdentificador(e.target.value)}
      />
      <Campo
        etiqueta={t('acceso.contrasena')}
        type="password"
        autoComplete="current-password"
        required
        value={contrasena}
        onChange={(e) => setContrasena(e.target.value)}
      />
      <button type="submit" className="boton ancho" disabled={enviando || !identificador || !contrasena}>
        {enviando ? t('comun.un_momento') : t('acceso.entrar')}
      </button>
      <Link to="/acces/recupera" className="boton-texto" style={{ justifySelf: 'center' }}>
        {t('acceso.olvido')}
      </Link>
    </form>
  );
}

interface DatosAlta {
  nombre: string;
  apellidos: string;
  email: string;
  telefono: string;
  num_colegiado: string;
  clinica: string;
  poblacion: string;
}

function FormularioAlta() {
  const navegar = useNavigate();
  const [d, setD] = useState<DatosAlta>({
    nombre: '', apellidos: '', email: '', telefono: '', num_colegiado: '', clinica: '', poblacion: '',
  });
  const [privacidad, setPrivacidad] = useState(false);
  const [sugerencias, setSugerencias] = useState<ClinicaSugerida[]>([]);
  const [union, setUnion] = useState<ClinicaSugerida | null>(null);
  const [errores, setErrores] = useState<Record<string, string>>({});
  const [error, setError] = useState('');
  const [enviando, setEnviando] = useState(false);

  const cambiar = (campo: keyof DatosAlta) => (e: { target: { value: string } }) =>
    setD((v) => ({ ...v, [campo]: e.target.value }));

  // Mientras escribe la clínica (o el correo), clínicas parecidas que ya existen.
  useEffect(() => {
    if (d.clinica.trim().length < 3 && !d.email.includes('@')) {
      setSugerencias([]);
      return;
    }
    const temporizador = window.setTimeout(() => {
      const q = new URLSearchParams({ nombre: d.clinica.trim(), email: d.email.trim() });
      api
        .get<{ clinicas: ClinicaSugerida[] }>(`/clinicas/sugerencias?${q}`)
        .then((r) => setSugerencias(r.clinicas))
        .catch(() => setSugerencias([]));
    }, 350);
    return () => window.clearTimeout(temporizador);
  }, [d.clinica, d.email]);

  async function enviar(e: FormEvent) {
    e.preventDefault();
    setError('');
    setErrores({});
    setEnviando(true);
    try {
      await api.post('/auth/registro', {
        nombre: d.nombre,
        apellidos: d.apellidos,
        email: d.email,
        telefono: d.telefono,
        num_colegiado: d.num_colegiado,
        clinica: { nombre: union ? union.nombre : d.clinica, poblacion: d.poblacion },
        privacidad,
        ...(union ? { union_clinica_id: union.id } : {}),
      });
      navegar('/acces/verifica-correu', { state: { email: d.email.trim().toLowerCase() } });
    } catch (err) {
      if (err instanceof ErrorApi && err.campos) setErrores(err.campos);
      setError(mensajeDe(err));
    } finally {
      setEnviando(false);
    }
  }

  return (
    <form className="formulario dos" onSubmit={enviar} noValidate>
      {error ? <div className="entero"><Aviso tipo="error">{error}</Aviso></div> : null}
      <Campo etiqueta={t('alta.nombre')} autoComplete="given-name" value={d.nombre} onChange={cambiar('nombre')} error={errores.nombre} required />
      <Campo etiqueta={t('alta.apellidos')} autoComplete="family-name" value={d.apellidos} onChange={cambiar('apellidos')} error={errores.apellidos} required />
      <Campo
        etiqueta={t('alta.email')}
        type="email"
        autoComplete="email"
        value={d.email}
        onChange={cambiar('email')}
        error={errores.email}
        ayuda={t('alta.emailAyuda')}
        required
      />
      <Campo etiqueta={t('alta.telefono')} type="tel" autoComplete="tel" value={d.telefono} onChange={cambiar('telefono')} error={errores.telefono} required />
      <Campo
        etiqueta={t('alta.clinica')}
        autoComplete="organization"
        value={union ? union.nombre : d.clinica}
        onChange={(e) => {
          setUnion(null);
          cambiar('clinica')(e);
        }}
        error={errores['clinica.nombre']}
        required
      />
      <Campo etiqueta={t('alta.poblacion')} autoComplete="address-level2" value={d.poblacion} onChange={cambiar('poblacion')} />
      {sugerencias.length > 0 ? (
        <div className="entero">
          <small className="texto-suave">{t('alta.sugerencias')}</small>
          <ul className="sugerencias">
            {sugerencias.map((c) => (
              <li key={c.id} className={union?.id === c.id ? 'elegida' : undefined}>
                <span>
                  <Building2 size={16} aria-hidden style={{ display: 'inline', verticalAlign: '-3px', marginRight: 6 }} />
                  <strong>{c.nombre}</strong>
                  {c.poblacion ? <span className="texto-suave"> · {c.poblacion}</span> : null}
                </span>
                {union?.id === c.id ? (
                  <button type="button" className="boton-texto" onClick={() => setUnion(null)}>
                    <Check size={16} aria-hidden /> {t('alta.unirElegida')}
                  </button>
                ) : (
                  <button type="button" className="boton-texto" onClick={() => setUnion(c)}>
                    {t('alta.unir')}
                  </button>
                )}
              </li>
            ))}
          </ul>
          {union ? <small className="texto-suave">{t('alta.unirExplicacion')}</small> : null}
        </div>
      ) : null}
      <Campo etiqueta={t('alta.colegiado')} value={d.num_colegiado} onChange={cambiar('num_colegiado')} ayuda={t('comun.opcional')} />
      <label className="casilla entero">
        <input type="checkbox" checked={privacidad} onChange={(e) => setPrivacidad(e.target.checked)} />
        <span>
          {t('alta.privacidad')} <Link to="/legal/privacitat" target="_blank" style={{ textDecoration: 'underline' }}>{t('alta.privacidadEnlace')}</Link>
          {errores.privacidad ? <span className="error-campo" style={{ display: 'block', color: 'var(--alerta)' }}>{errores.privacidad}</span> : null}
        </span>
      </label>
      <div className="entero">
        <button type="submit" className="boton ancho" disabled={enviando}>
          {enviando ? t('comun.un_momento') : t('alta.crear')}
        </button>
      </div>
    </form>
  );
}
