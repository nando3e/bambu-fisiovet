// La línea temporal del caso: cada paso con su fecha. Círculo lleno = hecho;
// círculo vacío y marcado = el siguiente paso; vacío y gris = lo que falta. Si
// acaba rechazada o cerrada, el último círculo lo dice (rojo o gris).
import { AlertTriangle, Check, X } from 'lucide-react';
import { fecha, t } from '../../i18n/index.ts';
import { fechaCorta, type Ficha } from './comun.tsx';

type EstadoPaso = 'hecho' | 'siguiente' | 'pendiente' | 'rechazada' | 'cerrada';
interface Paso { clave: string; titulo: string; detalle: string; estado: EstadoPaso; atencion?: boolean }

function pasosDe(f: Ficha, deriva: boolean): Paso[] {
  const enviada = Boolean(f.enviado_el);
  const resuelta = !['borrador', 'enviada'].includes(f.estado);
  const pasos: Paso[] = [
    { clave: 'enviada', titulo: t('linea.enviada'), detalle: f.enviado_el ? fecha(f.enviado_el) : '', estado: enviada ? 'hecho' : 'pendiente' },
    {
      clave: 'rebuda', titulo: t('linea.rebuda'),
      detalle: f.vista_el ? (deriva || !f.vista_por ? fecha(f.vista_el) : `${fecha(f.vista_el)} · ${f.vista_por}`) : '',
      estado: f.vista_el || resuelta ? 'hecho' : 'pendiente',
    },
  ];
  if (f.estado === 'rechazada') {
    pasos.push({ clave: 'rebutjada', titulo: t('linea.rebutjada'), detalle: f.resuelto_el ? fecha(f.resuelto_el) : '', estado: 'rechazada' });
    return pasos;
  }
  const aceptada = ['aceptada', 'en_tratamiento', 'alta', 'abandonada'].includes(f.estado);
  pasos.push({ clave: 'acceptada', titulo: t('linea.acceptada'), detalle: aceptada && f.resuelto_el ? fecha(f.resuelto_el) : '', estado: aceptada ? 'hecho' : 'pendiente' });
  const conCita = Boolean(f.en_tratamiento_el);
  // Un informe de alta puede dar el alta sin pasar por «Ja té cita»: entonces ese paso no sale.
  if (conCita || f.estado !== 'alta') {
    pasos.push({
      clave: 'cita', titulo: t('linea.cita'),
      detalle: f.primera_visita ? t('linea.primeraVisita', { fecha: fechaCorta(f.primera_visita) }) : f.en_tratamiento_el ? fecha(f.en_tratamiento_el) : '',
      estado: conCita ? 'hecho' : 'pendiente',
      atencion: !deriva && f.atascado,
    });
  }
  if (f.estado === 'abandonada') {
    // Lo que no llegó a pasar no sale: termina en «Tancada».
    const hechos = pasos.filter((p) => p.estado === 'hecho');
    hechos.push({ clave: 'tancada', titulo: t('linea.tancada'), detalle: f.cerrado_el ? fecha(f.cerrado_el) : '', estado: 'cerrada' });
    return hechos;
  }
  pasos.push({ clave: 'alta', titulo: t('linea.alta'), detalle: f.estado === 'alta' && f.cerrado_el ? fecha(f.cerrado_el) : '', estado: f.estado === 'alta' ? 'hecho' : 'pendiente' });
  // El siguiente paso: el primero que falta.
  const siguiente = pasos.find((p) => p.estado === 'pendiente');
  if (siguiente) siguiente.estado = 'siguiente';
  return pasos;
}

export function LineaTemporal({ ficha, deriva }: { ficha: Ficha; deriva: boolean }) {
  const pasos = pasosDe(ficha, deriva);
  return (
    <ol className="linea-temporal" aria-label={t('linea.titulo')}>
      {pasos.map((p) => (
        <li key={p.clave} className={`${p.estado}${p.atencion ? ' atencion' : ''}`} aria-current={p.estado === 'siguiente' ? 'step' : undefined}>
          <span className="circulo" aria-hidden>
            {p.estado === 'hecho' ? <Check size={14} strokeWidth={3} /> : p.estado === 'rechazada' || p.estado === 'cerrada' ? <X size={14} strokeWidth={3} /> : null}
          </span>
          <span className="texto-paso">
            <strong>{p.titulo}</strong>
            {p.detalle ? <small>{p.detalle}</small> : null}
            {p.estado === 'siguiente' ? <small className="siguiente-paso">{t('linea.siguiente')}</small> : null}
            {p.atencion ? <small className="encallada"><AlertTriangle size={12} aria-hidden /> {t('casos.atascado')}</small> : null}
          </span>
        </li>
      ))}
    </ol>
  );
}
