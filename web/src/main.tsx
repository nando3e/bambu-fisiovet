import { StrictMode } from 'react';
import { createRoot } from 'react-dom/client';
// Las fuentes se sirven desde la propia app: sin Google Fonts, la PWA se ve
// igual sin conexión y no se manda la IP de nadie a terceros.
import '@fontsource-variable/dm-sans';
import '@fontsource-variable/manrope';
import './disseny/tokens.css';
import './disseny/base.css';
import './disseny/componentes.css';
import { App } from './App.tsx';

createRoot(document.getElementById('arrel')!).render(
  <StrictMode>
    <App />
  </StrictMode>,
);
