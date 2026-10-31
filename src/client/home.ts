import { arenas, species } from '../data';
import { chooseSpecies } from './ui/selection';
import { renderSpeciesIndex } from './ui/species-index';
import { playHref, roomFromSearch, SPECIES_STORAGE_KEY, NAME_STORAGE_KEY } from '../network/room-url';
import './style.css';

async function start() {
  const root = document.querySelector<HTMLElement>('#app')!;
  if (location.pathname === '/species' || location.pathname === '/species/') {
    document.title = 'Species index · microbia';
    renderSpeciesIndex(root, arenas['pond-water'], species);
    appendCredit(root);
    return;
  }
  const room = roomFromSearch(location.search);
  let savedName = '';
  try { savedName = sessionStorage.getItem(NAME_STORAGE_KEY) ?? ''; } catch { /* Optional name remains blank. */ }
  document.title = 'microbia · Pond Water';
  const choice = chooseSpecies(root, arenas['pond-water'], species, room, savedName);
  appendCredit(root);
  const organism = await choice;
  const name = root.querySelector<HTMLInputElement>('#player-name')!.value.trim();
  const selectedRoom = root.querySelector<HTMLInputElement>('#room-name')!.value;
  let href = playHref(selectedRoom);
  try { sessionStorage.setItem(SPECIES_STORAGE_KEY, organism.id); sessionStorage.setItem(NAME_STORAGE_KEY, name); }
  catch { href += '&' + new URLSearchParams({ species: organism.id, name }); }
  location.assign(href);
}

function appendCredit(root: HTMLElement) {
  const footer = document.createElement('footer'); footer.className = 'site-credit';
  const link = document.createElement('a'); link.href = 'https://johncneumann.com'; link.textContent = 'johncneumann.com';
  footer.append(link); root.append(footer);
}

start().catch(error => {
  const notice = document.createElement('p');
  notice.setAttribute('role', 'alert');
  notice.textContent = error instanceof Error ? error.message : 'Unable to open the pond.';
  const home = document.createElement('a'); home.href = '/'; home.textContent = 'Back to home';
  document.querySelector('#app')!.append(notice, home);
});
