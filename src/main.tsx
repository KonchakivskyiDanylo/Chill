import { StrictMode } from 'react';
import { createRoot } from 'react-dom/client';
import { BrowserRouter } from 'react-router-dom';
import { installErrorReporting } from './analytics/client';
import { App } from './App';
import './styles/global.css';
import './styles/board.css';

installErrorReporting();

/*
 * Real paths since 1 Oct 2026 (`/game/tenaball`), so a search engine sees
 * every game as a page of its own. Addresses used to be hashes
 * (`/#/game/tenaball`), and links to them are out there: rewritten here,
 * before the router starts, so they land on the same page — and on a hash
 * typed into an open page, where the router is told with a popstate.
 */
const fromHash = () => {
  if (!location.hash.startsWith('#/')) return false;
  history.replaceState(null, '', location.hash.slice(1));
  return true;
};
fromHash();
window.addEventListener('hashchange', () => {
  if (fromHash()) window.dispatchEvent(new PopStateEvent('popstate'));
});

const container = document.getElementById('root');
if (!container) throw new Error('Missing #root element');

// Anything inside #root is the build's static copy of the page, for search
// engines (scripts/prerender.ts); the first render replaces it.
createRoot(container).render(
  <StrictMode>
    <BrowserRouter>
      <App />
    </BrowserRouter>
  </StrictMode>,
);
