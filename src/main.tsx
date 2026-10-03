import { StrictMode } from 'react';
import { createRoot } from 'react-dom/client';
import '@fontsource/newsreader/300.css';
import '@fontsource/newsreader/400.css';
import '@fontsource/newsreader/400-italic.css';
import '@fontsource/ibm-plex-mono/400.css';
import './styles/tokens.css';
import './styles/global.css';
import { Universe } from './pages/Universe';

createRoot(document.getElementById('root')!).render(
  <StrictMode>
    <Universe />
  </StrictMode>,
);
