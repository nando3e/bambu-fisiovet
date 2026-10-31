// Todas las notificaciones, con el filtro de no leídas y «carrega'n més».
import { useCallback, useEffect, useState } from 'react';
import { CheckCheck } from 'lucide-react';
import { api, mensajeDe, type Notificacion } from '../../api.ts';
import { t } from '../../i18n/index.ts';
import { Aviso, Cargando, Interruptor, TituloPagina } from '../../componentes/comunes.tsx';
import { avisarCambioNotificaciones, ListaNotificaciones, useAbrirNotificacion } from '../../componentes/Notificaciones.tsx';

const PAGINA = 30;

export function PaginaNotificaciones() {
  const [lista, setLista] = useState<Notificacion[] | null>(null);
  const [noLeidas, setNoLeidas] = useState(0);
  const [soloNoLeidas, setSoloNoLeidas] = useState(false);
  const [hayMas, setHayMas] = useState(false);
  const [error, setError] = useState('');
  const abrir = useAbrirNotificacion();

  const cargar = useCallback(async (antesDe?: number) => {
    try {
      const q = new URLSearchParams({ limite: String(PAGINA), solo_no_leidas: soloNoLeidas ? '1' : '0' });
      if (antesDe) q.set('antes_de', String(antesDe));
      const r = await api.get<{ notificaciones: Notificacion[]; no_leidas: number }>(`/notificaciones?${q}`);
      setLista((actual) => (antesDe && actual ? [...actual, ...r.notificaciones] : r.notificaciones));
      setNoLeidas(r.no_leidas);
      setHayMas(r.notificaciones.length === PAGINA);
    } catch (err) {
      setError(mensajeDe(err));
    }
  }, [soloNoLeidas]);

  useEffect(() => {
    setLista(null);
    void cargar();
  }, [cargar]);

  return (
    <>
      <TituloPagina titulo={t('notificaciones.titulo')} subtitulo={t('notificaciones.pendientes', { n: noLeidas })}>
        {noLeidas > 0 ? (
          <button
            type="button"
            className="boton-secundario"
            onClick={async () => {
              try {
                await api.post('/notificaciones/leidas');
              } catch (err) {
                window.alert(mensajeDe(err));
                return;
              }
              avisarCambioNotificaciones();
              await cargar();
            }}
          >
            <CheckCheck size={18} aria-hidden /> {t('notificaciones.marcarTodas')}
          </button>
        ) : null}
      </TituloPagina>
      <label style={{ display: 'flex', gap: 10, alignItems: 'center', marginBottom: 14 }}>
        <Interruptor etiqueta={t('notificaciones.soloNoLeidas')} marcado={soloNoLeidas} alCambiar={setSoloNoLeidas} />
        <span>{t('notificaciones.soloNoLeidas')}</span>
      </label>
      {error ? <Aviso tipo="error">{error}</Aviso> : null}
      {lista === null ? <Cargando /> : <ListaNotificaciones notificaciones={lista} alAbrir={(n) => void abrir(n)} />}
      {hayMas && lista ? (
        <div className="acciones" style={{ justifyContent: 'center', marginTop: 14 }}>
          <button type="button" className="boton-secundario" onClick={() => void cargar(lista[lista.length - 1]?.id)}>
            {t('notificaciones.cargarMas')}
          </button>
        </div>
      ) : null}
    </>
  );
}
