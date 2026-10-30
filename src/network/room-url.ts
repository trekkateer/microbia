export const DEFAULT_ROOM = '1';
export const SPECIES_STORAGE_KEY = 'microbia.species';

export function validateRoom(room: string): string {
  if (!/^[a-zA-Z0-9-]{1,24}$/.test(room)) throw new Error('Use 1-24 letters, numbers or hyphens for the room');
  return room;
}

export function roomFromSearch(search: string): string {
  return validateRoom(new URLSearchParams(search).get('room') ?? DEFAULT_ROOM);
}

export function playHref(room: string): string {
  return '/play?' + new URLSearchParams({ room: validateRoom(room) });
}

export function selectionHref(room: string): string {
  return '/?' + new URLSearchParams({ room: validateRoom(room) });
}
