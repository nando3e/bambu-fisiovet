// Cuando hay una versión nueva desplegada, la app lo dice en vez de seguir
// sirviendo la vieja de la caché del service worker.
import { useRegisterSW } from 'virtual:pwa-register/react';
import { RefreshCw } from 'lucide-react';
import { t } from '../i18n/index.ts';

export function AvisoVersion() {
  const {
    needRefresh: [hayNueva],
    updateServiceWorker,
  } = useRegisterSW({
    onRegisteredSW(_url, registro) {
      // Comprobar cada hora si hay versión nueva, con la app abierta.
      if (registro) window.setInterval(() => void registro.update(), 60 * 60 * 1000);
    },
  });
  if (!hayNueva) return null;
  return (
    <div className="aviso-version" role="status">
      <span>{t('version.nueva')}</span>
      <button type="button" className="boton" onClick={() => void updateServiceWorker(true)}>
        <RefreshCw size={16} aria-hidden /> {t('version.recargar')}
      </button>
    </div>
  );
}
