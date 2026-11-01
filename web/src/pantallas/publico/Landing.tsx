// La web pública. Estructura y aspecto de la demo de referencia, con una sola
// puerta de entrada («Deriva un cas»: cabecera y hero) y el contacto leído de
// la configuración: lo que está vacío no se enseña.
import { useEffect, useState } from 'react';
import { Link } from 'react-router';
import {
  ArrowDown, ArrowUpRight, Asterisk, Check, ClipboardList, AtSign, LogIn, Mail, MapPin,
  Menu, MessagesSquare, Phone, Clock, Sprout, TrendingUp, UserPlus, Waves, X,
} from 'lucide-react';
import { api } from '../../api.ts';
import { t } from '../../i18n/index.ts';
import { Marca, useAparecer } from '../../componentes/comunes.tsx';
import '../../disseny/landing.css';

interface Contacto {
  email?: string;
  telefono?: string;
  direccion?: string;
  horario?: string;
  maps_url?: string;
  instagram?: string;
}

const CINTA = ['cinta.1', 'cinta.2', 'cinta.3', 'cinta.4'] as const;

export function Landing() {
  const [menuAbierto, setMenuAbierto] = useState(false);
  const [contacto, setContacto] = useState<Contacto>({});
  const [imagenes, setImagenes] = useState<{ portada: string | null; instalaciones: string | null }>({
    portada: null,
    instalaciones: null,
  });
  const raiz = useAparecer(contacto);

  useEffect(() => {
    api.get<Contacto>('/publico/contacto').then(setContacto).catch(() => setContacto({}));
    api.get<typeof imagenes>('/publico/imagenes').then(setImagenes).catch(() => {});
  }, []);

  const cerrar = () => setMenuAbierto(false);
  const anio = new Date().getFullYear();

  return (
    <div className="web" ref={raiz}>
      <header className="web-cabecera">
        <Marca a="/" />
        <button
          type="button"
          className="boton-icono web-hamburguesa"
          aria-label={menuAbierto ? t('web.cerrarMenu') : t('web.abrirMenu')}
          aria-expanded={menuAbierto}
          onClick={() => setMenuAbierto((v) => !v)}
        >
          {menuAbierto ? <X size={24} aria-hidden /> : <Menu size={24} aria-hidden />}
        </button>
        <nav className={`web-menu${menuAbierto ? ' abierto' : ''}`} aria-label={t('web.menu')}>
          <a href="#serveis" onClick={cerrar}>{t('web.menu.servicios')}</a>
          <a href="#com-funciona" onClick={cerrar}>{t('web.menu.comoFunciona')}</a>
          <a href="#installacions" onClick={cerrar}>{t('web.menu.instalaciones')}</a>
          <a href="#contacte" onClick={cerrar}>{t('web.menu.contacto')}</a>
          <Link to="/acces" className="web-acceder" onClick={cerrar}>
            <LogIn size={18} aria-hidden /> {t('web.acceder')}
          </Link>
          <Link to="/acces" className="boton" onClick={cerrar}>
            {t('web.derivaUnCaso')} <ArrowUpRight size={18} aria-hidden />
          </Link>
        </nav>
      </header>

      <main>
        <section className="web-hero">
          <div className="web-hero-texto">
            <div className="antetitulo aparece">{t('web.hero.antetitulo')}</div>
            <h1 className="aparece retraso-1">
              {t('web.hero.titulo1')}
              <em>{t('web.hero.titulo2')}</em>
            </h1>
            <p className="aparece retraso-2">{t('web.hero.texto')}</p>
            <div className="web-hero-acciones aparece retraso-2">
              <Link to="/acces" className="boton">
                {t('web.hero.derivar')} <ArrowUpRight size={18} aria-hidden />
              </Link>
              <a href="#serveis" className="boton-secundario">
                {t('web.hero.conoce')} <ArrowDown size={18} aria-hidden />
              </a>
            </div>
          </div>
          <div className="web-hero-arte aparece retraso-1" aria-hidden>
            <div className="web-hero-disco">
              <img src={imagenes.portada ?? '/img/portada.webp'} alt="" width={1200} height={801} />
            </div>
            <div className="web-sello">
              <div>
                <strong>{t('web.hero.sello1')}</strong>
                {t('web.hero.sello2')}
              </div>
            </div>
          </div>
        </section>

        <div className="web-cinta" aria-hidden>
          <div className="web-cinta-pista">
            {[0, 1].map((vuelta) => (
              <span key={vuelta}>
                {CINTA.map((c) => (
                  <span key={c}>
                    {t(c)} <Asterisk size={16} />
                  </span>
                ))}
              </span>
            ))}
          </div>
        </div>

        <section className="web-seccion" id="serveis">
          <div className="web-seccion-cabeza aparece">
            <div>
              <div className="antetitulo">{t('web.servicios.antetitulo')}</div>
              <h2>{t('web.servicios.titulo')}</h2>
            </div>
            <p>{t('web.servicios.texto')}</p>
          </div>
          <div className="web-servicios">
            {([
              ['web.servicio1.numero', 'web.servicio1.titulo', 'web.servicio1.texto', TrendingUp],
              ['web.servicio2.numero', 'web.servicio2.titulo', 'web.servicio2.texto', Waves],
              ['web.servicio3.numero', 'web.servicio3.titulo', 'web.servicio3.texto', Sprout],
            ] as const).map(([numero, titulo, texto, Icono], i) => (
              <article key={numero} className={`web-servicio aparece${i ? ` retraso-${i}` : ''}`}>
                <div>
                  <div className="numero">{t(numero)}</div>
                  <Icono size={42} strokeWidth={1.5} aria-hidden />
                  <h3>{t(titulo)}</h3>
                  <p>{t(texto)}</p>
                </div>
              </article>
            ))}
          </div>
        </section>

        <section className="web-seccion" id="com-funciona" style={{ background: 'var(--crema)' }}>
          <div className="web-seccion-cabeza aparece">
            <div>
              <div className="antetitulo">{t('web.pasos.antetitulo')}</div>
              <h2>{t('web.pasos.titulo')}</h2>
            </div>
            <p>{t('web.pasos.texto')}</p>
          </div>
          <div className="web-pasos">
            {([
              ['web.paso1.titulo', 'web.paso1.texto', UserPlus],
              ['web.paso2.titulo', 'web.paso2.texto', ClipboardList],
              ['web.paso3.titulo', 'web.paso3.texto', MessagesSquare],
            ] as const).map(([titulo, texto, Icono], i) => (
              <article key={titulo} className={`web-paso aparece${i ? ` retraso-${i}` : ''}`}>
                <div className="icono-paso"><Icono size={24} aria-hidden /></div>
                <h3>{t(titulo)}</h3>
                <p>{t(texto)}</p>
              </article>
            ))}
          </div>
          <div className="web-pasos-cta aparece">
            <Link to="/acces" className="boton">
              {t('web.pasos.cta')} <ArrowUpRight size={18} aria-hidden />
            </Link>
            <p>{t('web.pasos.ctaTexto')}</p>
          </div>
        </section>

        <section className="web-seccion" id="installacions">
          <div className="web-partido">
            <div className="web-marco aparece">
              <img src={imagenes.instalaciones ?? '/img/instalaciones.webp'} alt={t('web.espacio.fotoAlt')} width={1000} height={1250} loading="lazy" />
              <div className="web-nota">
                {t('web.espacio.nota')}
                <small>{t('web.espacio.notaTexto')}</small>
              </div>
            </div>
            <div className="aparece retraso-1">
              <div className="antetitulo">{t('web.espacio.antetitulo')}</div>
              <h2>{t('web.espacio.titulo')}</h2>
              <p>{t('web.espacio.texto')}</p>
              <ul className="web-checks">
                {(['web.espacio.check1', 'web.espacio.check2', 'web.espacio.check3'] as const).map((c) => (
                  <li key={c}><Check size={18} aria-hidden /> {t(c)}</li>
                ))}
              </ul>
            </div>
          </div>
        </section>

        <section className="web-banda">
          <div className="antetitulo">{t('web.filosofia.antetitulo')}</div>
          <h2 className="aparece">{t('web.filosofia.titulo')}</h2>
          <p className="aparece">{t('web.filosofia.texto')}</p>
        </section>

        <section className="web-seccion" id="nosaltres">
          <div className="web-nosotros aparece">
            <div className="web-nosotros-logo">
              <img src="/icona-512.png" alt={t('web.logoAlt')} width={260} height={260} />
            </div>
            <div>
              <div className="antetitulo">{t('web.nosotros.antetitulo')}</div>
              <h2>{t('web.nosotros.titulo')}</h2>
              <p>{t('web.nosotros.texto1')}</p>
              <p>{t('web.nosotros.texto2')}</p>
            </div>
          </div>
        </section>

        <section className="web-contacto" id="contacte">
          <div className="aparece">
            <div className="antetitulo">{t('web.contacto.antetitulo')}</div>
            <h2>{t('web.contacto.titulo')}</h2>
            <p>{t('web.contacto.texto')}</p>
          </div>
          <EnlacesContacto contacto={contacto} />
        </section>
      </main>

      <footer className="web-pie">
        <div className="web-pie-principal">
          <div>
            <Marca a="/" clara />
            <p>{t('web.pie.lema')}</p>
          </div>
          <div className="web-pie-columna">
            <h3>{t('web.pie.explora')}</h3>
            <a href="#serveis">{t('web.menu.servicios')}</a>
            <a href="#com-funciona">{t('web.menu.comoFunciona')}</a>
            <a href="#installacions">{t('web.menu.instalaciones')}</a>
            <a href="#nosaltres">{t('web.menu.nosotros')}</a>
          </div>
          <div className="web-pie-columna">
            <h3>{t('web.pie.hablemos')}</h3>
            {contacto.telefono ? <a href={`tel:${contacto.telefono.replace(/\s/g, '')}`}>{contacto.telefono}</a> : null}
            {contacto.email ? <a href={`mailto:${contacto.email}`}>{contacto.email}</a> : null}
            {contacto.direccion ? <span>{contacto.direccion}</span> : null}
            {contacto.instagram ? <a href={contacto.instagram} target="_blank" rel="noopener noreferrer">Instagram</a> : null}
          </div>
        </div>
        <div className="web-pie-base">
          <span>{t('web.pie.derechos', { anio })}</span>
          <Link to="/legal/privacitat">{t('web.pie.privacidad')}</Link>
          <span>{t('web.pie.cuidado')}</span>
        </div>
      </footer>
    </div>
  );
}

function EnlacesContacto({ contacto }: { contacto: Contacto }) {
  const enlaces = [
    contacto.email && { href: `mailto:${contacto.email}`, icono: Mail, etiqueta: t('web.contacto.escribe'), valor: contacto.email },
    contacto.telefono && {
      href: `tel:${contacto.telefono.replace(/\s/g, '')}`, icono: Phone, etiqueta: t('web.contacto.llama'), valor: contacto.telefono,
    },
    contacto.direccion && {
      href: contacto.maps_url || undefined, icono: MapPin, etiqueta: t('web.contacto.encuentranos'), valor: contacto.direccion,
    },
    contacto.horario && { href: undefined, icono: Clock, etiqueta: t('web.contacto.horario'), valor: contacto.horario },
    contacto.instagram && { href: contacto.instagram, icono: AtSign, etiqueta: 'Instagram', valor: t('web.contacto.siguenos') },
  ].filter(Boolean) as { href?: string; icono: typeof Mail; etiqueta: string; valor: string }[];

  if (enlaces.length === 0) return null;
  return (
    <div className="web-enlaces aparece retraso-1">
      {enlaces.map(({ href, icono: Icono, etiqueta, valor }) => {
        const contenido = (
          <>
            <span>
              <small>{etiqueta}</small>
              {valor}
            </span>
            <Icono size={20} aria-hidden />
          </>
        );
        return href ? (
          <a
            key={etiqueta}
            className="web-enlace"
            href={href}
            {...(href.startsWith('http') ? { target: '_blank', rel: 'noopener noreferrer' } : {})}
          >
            {contenido}
          </a>
        ) : (
          <div key={etiqueta} className="web-enlace">{contenido}</div>
        );
      })}
    </div>
  );
}
