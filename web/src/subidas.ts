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
  limpiarError: () => void;
  /** Encola ficheros hacia una ruta con sus campos; resuelve cuando ese lote ha terminado. */
  encolar: (ficheros: File[], ruta: string, campos: Record<string, string>, etiqueta?: string) => Promise<void>;
  /** Espera a todo lo que haya en la fila. */
  esperar: () => Promise<void>;
}

export function useSubidas(alTerminarLote?: () => Promise<void> | void): Subidas {
  const [enCurso, setEnCurso] = useState<Subida[]>([]);
  const [error, setError] = useState('');
  const fila = useRef<Promise<void>>(Promise.resolve());

  const encolar = useCallback((ficheros: File[], ruta: string, campos: Record<string, string>, etiqueta?: string) => {
    if (ficheros.length === 0) return Promise.resolve();
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
      for (const { fichero, subida } of lote) {
        try {
          const { datos, nombre } = await reducir(fichero);
          await api.subir(ruta, datos, 'fichero', campos, nombre);
        } catch (err) {
          setError(t('hilo.errorSubida', { nombre: fichero.name, error: mensajeDe(err) }));
        } finally {
          setEnCurso((s) => s.filter((x) => x.clave !== subida.clave));
          if (subida.vista) URL.revokeObjectURL(subida.vista);
        }
      }
      await alTerminarLote?.();
    });
    fila.current = vuelta.catch(() => {});
    return vuelta;
  }, [alTerminarLote]);

  const esperar = useCallback(() => fila.current, []);
  const limpiarError = useCallback(() => setError(''), []);

  return { enCurso, error, limpiarError, encolar, esperar };
}
