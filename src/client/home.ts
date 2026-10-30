import { arenas, species } from '../data';
import { chooseSpecies } from './ui/selection';
import { playHref, roomFromSearch, SPECIES_STORAGE_KEY, NAME_STORAGE_KEY } from '../network/room-url';
import './style.css';

async function start() {
  const root = document.querySelector<HTMLElement>('#app')!;
  const room = roomFromSearch(location.search);
  let savedName = '';
  try { savedName = sessionStorage.getItem(NAME_STORAGE_KEY) ?? ''; } catch { /* Optional name remains blank. */ }
  const organism = await chooseSpecies(root, arenas['pond-water'], species, room, savedName);
  const name = root.querySelector<HTMLInputElement>('#player-name')!.value.trim();
  const selectedRoom = root.querySelector<HTMLInputElement>('#room-name')!.value;
  let href = playHref(selectedRoom);
  try { sessionStorage.setItem(SPECIES_STORAGE_KEY, organism.id); sessionStorage.setItem(NAME_STORAGE_KEY, name); }
  catch { href += '&' + new URLSearchParams({ species: organism.id, name }); }
  location.assign(href);
}

start().catch(error => {
  const notice = document.createElement('p');
  notice.setAttribute('role', 'alert');
  notice.textContent = error instanceof Error ? error.message : 'Unable to open the pond.';
  const home = document.createElement('a'); home.href = '/'; home.textContent = 'Back to home';
  document.querySelector('#app')!.append(notice, home);
});
