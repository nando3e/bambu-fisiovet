// Las pantallas a las que llevan los correos: fijar la contraseña (alta,
// invitación y recuperación comparten esta), pedir la recuperación y esperar
// la verificación. Y la página de privacidad.
import { useEffect, useState, type FormEvent } from 'react';
import { Link, useLocation, useNavigate, useParams } from 'react-router';
import { ArrowLeft, MailCheck } from 'lucide-react';
import { api, mensajeDe, type Usuario } from '../../api.ts';
import { t } from '../../i18n/index.ts';
import { useSesion } from '../../sesion.tsx';
import { Aviso, Campo, Cargando } from '../../componentes/comunes.tsx';

function Caja({ titulo, subtitulo, children }: { titulo: string; subtitulo?: string; children: React.ReactNode }) {
  return (
    <div className="pantalla-acceso">
      <div className="caja-acceso">
        <img className="logo-acceso" src="/logo-bambu.png" alt="BAMBÚ Fisiovet" width={76} height={76} />
        <h1>{titulo}</h1>
        {subtitulo ? <p>{subtitulo}</p> : null}
        {children}
      </div>
    </div>
  );
}

interface InfoToken {
  estado: 'valido' | 'caducado' | 'usado' | 'inexistente';
  tipo?: 'verificacion' | 'recuperacion' | 'invitacion';
  nombre?: string | null;
  email?: string | null;
  rol?: string | null;
}

export function Establece() {
  const { token = '' } = useParams();
  const { fijar } = useSesion();
  const navegar = useNavigate();
  const [info, setInfo] = useState<InfoToken | null>(null);
  const [contrasena, setContrasena] = useState('');
  const [repetida, setRepetida] = useState('');
  const [error, setError] = useState('');
  const [ok, setOk] = useState('');
  const [enviando, setEnviando] = useState(false);

  useEffect(() => {
    api.get<InfoToken>(`/auth/tokens/${encodeURIComponent(token)}`)
      .then(setInfo)
      .catch(() => setInfo({ estado: 'inexistente' }));
  }, [token]);

  if (!info) return <Cargando />;

  if (info.estado !== 'valido') {
    return (
      <Caja titulo={t('enlace.noValido')} subtitulo={t('enlace.noValidoTexto')}>
        {ok ? <Aviso>{ok}</Aviso> : null}
        {error ? <Aviso tipo="error">{error}</Aviso> : null}
        <div className="formulario">
          {info.estado === 'caducado' && info.tipo === 'verificacion' && info.email ? (
            <button
              type="button"
              className="boton ancho"
              onClick={async () => {
                try {
                  await api.post('/auth/reenvia-verificacion', { email: info.email });
                  setOk(t('enlace.reenviado'));
                } catch (err) {
                  setError(mensajeDe(err));
                }
              }}
            >
              {t('enlace.reenviar')}
            </button>
          ) : null}
          {info.tipo === 'recuperacion' ? (
            <Link to="/acces/recupera" className="boton ancho">{t('enlace.pedirOtro')}</Link>
          ) : null}
          <Link to="/acces" className="boton-secundario ancho">{t('enlace.irAcceso')}</Link>
        </div>
      </Caja>
    );
  }

  const titulo = info.tipo === 'recuperacion'
    ? t('enlace.tituloRecuperacion')
    : info.tipo === 'invitacion'
      ? t('enlace.tituloInvitacion', { nombre: info.nombre ?? '' })
      : t('enlace.tituloVerificacion', { nombre: info.nombre ?? '' });

  async function enviar(e: FormEvent) {
    e.preventDefault();
    setError('');
    if (contrasena !== repetida) {
      setError(t('enlace.noCoinciden'));
      return;
    }
    setEnviando(true);
    try {
      const r = await api.post<{ destino: string; usuario: Usuario }>('/auth/establece-contrasena', { token, contrasena });
      fijar(r.usuario);
      navegar(r.destino, { replace: true });
    } catch (err) {
      setError(mensajeDe(err));
    } finally {
      setEnviando(false);
    }
  }

  return (
    <Caja titulo={titulo} subtitulo={t('enlace.subtitulo')}>
      <form className="formulario" onSubmit={enviar} noValidate>
        {error ? <Aviso tipo="error">{error}</Aviso> : null}
        {info.email ? (
          <input type="email" autoComplete="username" value={info.email} readOnly hidden />
        ) : null}
        <Campo
          etiqueta={t('enlace.contrasena')}
          type="password"
          autoComplete="new-password"
          value={contrasena}
          onChange={(e) => setContrasena(e.target.value)}
          ayuda={t('enlace.contrasenaAyuda')}
          required
        />
        <Campo
          etiqueta={t('enlace.repetir')}
          type="password"
          autoComplete="new-password"
          value={repetida}
          onChange={(e) => setRepetida(e.target.value)}
          required
        />
        <button type="submit" className="boton ancho" disabled={enviando || !contrasena}>
          {enviando ? t('comun.un_momento') : t('enlace.guardar')}
        </button>
      </form>
    </Caja>
  );
}

export function Recupera() {
  const [email, setEmail] = useState('');
  const [hecho, setHecho] = useState('');
  const [error, setError] = useState('');
  const [enviando, setEnviando] = useState(false);

  async function enviar(e: FormEvent) {
    e.preventDefault();
    setError('');
    setEnviando(true);
    try {
      const r = await api.post<{ mensaje: string }>('/auth/recupera', { email });
      setHecho(r.mensaje);
    } catch (err) {
      setError(mensajeDe(err));
    } finally {
      setEnviando(false);
    }
  }

  return (
    <Caja titulo={t('recupera.titulo')} subtitulo={t('recupera.subtitulo')}>
      {hecho ? (
        <Aviso>{hecho}</Aviso>
      ) : (
        <form className="formulario" onSubmit={enviar} noValidate>
          {error ? <Aviso tipo="error">{error}</Aviso> : null}
          <Campo etiqueta={t('alta.email')} type="email" autoComplete="email" value={email} onChange={(e) => setEmail(e.target.value)} required />
          <button type="submit" className="boton ancho" disabled={enviando || !email}>
            {enviando ? t('comun.un_momento') : t('recupera.enviar')}
          </button>
        </form>
      )}
      <Link to="/acces" className="volver"><ArrowLeft size={16} aria-hidden /> {t('enlace.irAcceso')}</Link>
    </Caja>
  );
}

export function VerificaCorreo() {
  const estado = useLocation().state as { email?: string } | null;
  const email = estado?.email ?? '';
  const [mensaje, setMensaje] = useState('');
  const [error, setError] = useState('');
  return (
    <Caja titulo={t('verifica.titulo')}>
      <div style={{ display: 'grid', placeItems: 'center', margin: '8px 0 14px', color: 'var(--verde)' }}>
        <MailCheck size={48} aria-hidden />
      </div>
      <p style={{ textAlign: 'center' }}>{email ? t('verifica.textoCon', { email }) : t('verifica.texto')}</p>
      <p className="texto-suave" style={{ textAlign: 'center', fontSize: '0.88rem' }}>{t('verifica.spam')}</p>
      {mensaje ? <Aviso>{mensaje}</Aviso> : null}
      {error ? <Aviso tipo="error">{error}</Aviso> : null}
      {email ? (
        <button
          type="button"
          className="boton-secundario ancho"
          onClick={async () => {
            setError('');
            try {
              await api.post('/auth/reenvia-verificacion', { email });
              setMensaje(t('enlace.reenviado'));
            } catch (err) {
              setError(mensajeDe(err));
            }
          }}
        >
          {t('enlace.reenviar')}
        </button>
      ) : null}
      <Link to="/acces" className="volver"><ArrowLeft size={16} aria-hidden /> {t('enlace.irAcceso')}</Link>
    </Caja>
  );
}

export function Privacidad() {
  const [email, setEmail] = useState<string | undefined>();
  useEffect(() => {
    api.get<{ email?: string }>('/publico/contacto').then((c) => setEmail(c.email)).catch(() => {});
  }, []);
  return (
    <Caja titulo={t('privacidad.titulo')}>
      <div style={{ fontSize: '0.92rem' }}>
        <p>{t('privacidad.p1')}</p>
        <p>{t('privacidad.p2')}</p>
        <p>{t('privacidad.p3')}</p>
        <p>{email ? t('privacidad.contactoCon', { email }) : t('privacidad.contacto')}</p>
        <Aviso tipo="atencion">{t('privacidad.pendiente')}</Aviso>
      </div>
      <Link to="/" className="volver"><ArrowLeft size={16} aria-hidden /> {t('acceso.volverWeb')}</Link>
    </Caja>
  );
}
