// Subidas de ficheros en fila: una cada vez (el móvil no aguanta cinco a la
// vez), con vista previa local mientras sube y un error por fichero que no
// corta la cola. «Envia» de la derivación espera a que termine la fila.
import { useCallback, useRef, useState } from 'react';
import { api, mensajeDe } from './api.ts';
import { t } from './i18n/index.ts';
import { reducir, vistaPrevia } from './imagenes.ts';

export interface Subida {
  clave: string;
  nombre: string;
  vista: string | null;
  /** Lo que el que la encoló quiera recordar (la categoría, por ejemplo). */
  etiqueta: string | null;
}

export interface Subidas {
  enCurso: Subida[];
  error: string;
  /** Quita el error y pone a cero la cuenta de fallos. */
  limpiarError: () => void;
  /** Encola ficheros hacia una ruta con sus campos; resuelve, con cuántos han fallado, cuando ese lote ha terminado. */
  encolar: (ficheros: File[], ruta: string, campos: Record<string, string>, etiqueta?: string) => Promise<number>;
  /** Espera a todo lo que haya en la fila y dice cuántas subidas han fallado desde el último `limpiarError`. */
  esperar: () => Promise<number>;
}

export function useSubidas(alTerminarLote?: () => Promise<void> | void): Subidas {
  const [enCurso, setEnCurso] = useState<Subida[]>([]);
  const [error, setError] = useState('');
  const fila = useRef<Promise<unknown>>(Promise.resolve());
  const fallidas = useRef(0);

  const encolar = useCallback((ficheros: File[], ruta: string, campos: Record<string, string>, etiqueta?: string) => {
    if (ficheros.length === 0) return Promise.resolve(0);
    const lote = ficheros.map((fichero) => ({
      fichero,
      subida: {
        clave: `${Date.now()}-${Math.random().toString(36).slice(2, 7)}-${fichero.name}`,
        nombre: fichero.name,
        vista: vistaPrevia(fichero),
        etiqueta: etiqueta ?? null,
      } satisfies Subida,
    }));
    setEnCurso((s) => [...s, ...lote.map((l) => l.subida)]);
    const vuelta = fila.current.then(async () => {
      let fallos = 0;
      for (const { fichero, subida } of lote) {
        try {
          const { datos, nombre } = await reducir(fichero);
          await api.subir(ruta, datos, 'fichero', campos, nombre);
        } catch (err) {
          fallos += 1;
          fallidas.current += 1;
          setError(t('hilo.errorSubida', { nombre: fichero.name, error: mensajeDe(err) }));
        } finally {
          setEnCurso((s) => s.filter((x) => x.clave !== subida.clave));
          if (subida.vista) URL.revokeObjectURL(subida.vista);
        }
      }
      // Recargar la lista no puede tumbar la fila: si falla, se dice y sigue.
      try {
        await alTerminarLote?.();
      } catch (err) {
        setError(mensajeDe(err));
      }
      return fallos;
    });
    fila.current = vuelta;
    return vuelta;
  }, [alTerminarLote]);

  const esperar = useCallback(() => fila.current.then(() => fallidas.current), []);
  const limpiarError = useCallback(() => {
    setError('');
    fallidas.current = 0;
  }, []);

  return { enCurso, error, limpiarError, encolar, esperar };
}
