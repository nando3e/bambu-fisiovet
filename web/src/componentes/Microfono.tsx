// Micrófono para dictar notas: tocar para empezar y para acabar, barras de
// volumen mientras graba y papelera para descartar. Si la pantalla se cierra
// a media grabación, se para y lo grabado se descarta.
import { useEffect, useRef, useState } from 'react';
import { Mic, Square, Trash2 } from 'lucide-react';
import { t } from '../i18n/index.ts';

const BARRAS = 12;

export function Microfono({ alTerminar, desactivado = false }: {
  alTerminar: (audio: Blob) => void;
  desactivado?: boolean;
}) {
  const [grabando, setGrabando] = useState(false);
  const [segundos, setSegundos] = useState(0);
  const [niveles, setNiveles] = useState<number[]>(Array(BARRAS).fill(0.1));
  const [error, setError] = useState('');
  const grabadora = useRef<MediaRecorder | null>(null);
  const trozos = useRef<Blob[]>([]);
  const descartar = useRef(false);
  const limpiar = useRef<() => void>(() => {});
  const montado = useRef(true);
  // Mientras el navegador pide permiso: un segundo toque no abre otro flujo.
  const [pidiendo, setPidiendo] = useState(false);
  const pidiendoRef = useRef(false);

  // Al desmontar: parar y descartar.
  useEffect(() => {
    montado.current = true;
    return () => {
      montado.current = false;
      descartar.current = true;
      limpiar.current();
    };
  }, []);

  async function empezar() {
    if (pidiendoRef.current || grabadora.current?.state === 'recording') return;
    pidiendoRef.current = true;
    setPidiendo(true);
    setError('');
    let flujo: MediaStream;
    try {
      flujo = await navigator.mediaDevices.getUserMedia({ audio: true });
    } catch {
      if (montado.current) setError(t('informes.sinMicro'));
      return;
    } finally {
      pidiendoRef.current = false;
      if (montado.current) setPidiendo(false);
    }
    // Si la pantalla se cerró mientras se pedía permiso, el micro no se queda abierto.
    if (!montado.current) {
      flujo.getTracks().forEach((pista) => pista.stop());
      return;
    }
    const contexto = new AudioContext();
    const analizador = contexto.createAnalyser();
    analizador.fftSize = 64;
    contexto.createMediaStreamSource(flujo).connect(analizador);
    const datos = new Uint8Array(analizador.frequencyBinCount);
    let animacion = 0;
    const pintar = () => {
      analizador.getByteFrequencyData(datos);
      const paso = Math.max(1, Math.floor(datos.length / BARRAS));
      setNiveles(Array.from({ length: BARRAS }, (_, i) => Math.max(0.1, (datos[i * paso] ?? 0) / 255)));
      animacion = requestAnimationFrame(pintar);
    };
    pintar();
    const inicio = Date.now();
    const reloj = setInterval(() => setSegundos(Math.floor((Date.now() - inicio) / 1000)), 500);

    const r = new MediaRecorder(flujo);
    trozos.current = [];
    descartar.current = false;
    r.ondataavailable = (e) => {
      if (e.data.size) trozos.current.push(e.data);
    };
    r.onstop = () => {
      limpiar.current();
      setGrabando(false);
      setSegundos(0);
      if (!descartar.current && trozos.current.length) {
        alTerminar(new Blob(trozos.current, { type: r.mimeType || 'audio/webm' }));
      }
    };
    limpiar.current = () => {
      cancelAnimationFrame(animacion);
      clearInterval(reloj);
      flujo.getTracks().forEach((pista) => pista.stop());
      void contexto.close().catch(() => {});
      if (r.state !== 'inactive') r.stop();
      limpiar.current = () => {};
    };
    grabadora.current = r;
    r.start();
    setGrabando(true);
  }

  function parar(tirar: boolean) {
    descartar.current = tirar;
    grabadora.current?.stop();
  }

  return (
    <div className="microfono">
      {grabando ? (
        <>
          <button type="button" className="boton" onClick={() => parar(false)}>
            <Square size={18} aria-hidden /> {t('informes.parar')}
          </button>
          <span className="barras" aria-hidden>
            {niveles.map((n, i) => <span key={i} style={{ transform: `scaleY(${n})` }} />)}
          </span>
          <span className="reloj">{Math.floor(segundos / 60)}:{String(segundos % 60).padStart(2, '0')}</span>
          <button type="button" className="boton-icono" aria-label={t('informes.descartarGrabacion')} onClick={() => parar(true)}>
            <Trash2 size={18} aria-hidden />
          </button>
        </>
      ) : (
        <button type="button" className="boton-secundario" disabled={desactivado || pidiendo} onClick={() => void empezar()}>
          <Mic size={18} aria-hidden /> {t('informes.grabar')}
        </button>
      )}
      {error ? <span className="error-campo">{error}</span> : null}
    </div>
  );
}
