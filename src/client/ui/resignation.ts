import { selectionHref } from '../../network/room-url';

export function showResignation(viewport: HTMLElement, room: string, reason: string) {
  const panel = document.createElement('section');
  panel.className = 'death-panel resignation-panel';
  panel.setAttribute('role', 'alertdialog'); panel.setAttribute('aria-modal', 'true');
  panel.setAttribute('aria-labelledby', 'resignation-title'); panel.setAttribute('aria-describedby', 'resignation-reason');
  const card = document.createElement('div');
  const label = document.createElement('div'); label.className = 'eyebrow'; label.textContent = 'RUN ENDED';
  const title = document.createElement('h2'); title.id = 'resignation-title'; title.textContent = 'You left the pond.';
  const explanation = document.createElement('p'); explanation.id = 'resignation-reason'; explanation.textContent = reason;
  const detail = document.createElement('p'); detail.textContent = 'A bot takes over any surviving cells while the room is active. Start a new run to play again.';
  const restart = document.createElement('a'); restart.className = 'resignation-restart'; restart.href = selectionHref(room); restart.textContent = 'Start a new run';
  card.append(label, title, explanation, detail, restart); panel.append(card); viewport.append(panel);
  // Prevent keyboard interaction with controls behind the terminal screen.
  for (const sibling of viewport.children) if (sibling !== panel && sibling instanceof HTMLElement) sibling.inert = true;
  restart.focus();
}

