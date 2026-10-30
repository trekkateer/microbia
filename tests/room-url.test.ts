import { expect, it } from 'vitest';
import { DEFAULT_ROOM, roomFromSearch, playHref, selectionHref } from '../src/network/room-url';

it('maps numbered and existing named rooms to shareable arena URLs without changing their identity', () => {
  expect(DEFAULT_ROOM).toBe('1');
  expect(roomFromSearch('')).toBe('1');
  for (const room of ['1', '2', '123', 'pond', 'Friends-2']) {
    expect(playHref(room)).toBe(`/play?room=${room}`);
    expect(roomFromSearch(playHref(room).split('?')[1])).toBe(room);
    expect(selectionHref(room)).toBe(`/?room=${room}`);
  }
});

it('rejects invalid room links instead of joining an unintended default room', () => {
  for (const search of ['?room=', '?room=a%20b', '?room=%3Cscript%3E', '?room=' + 'a'.repeat(25)]) {
    expect(() => roomFromSearch(search)).toThrow('Use 1-24');
  }
  expect(() => playHref('../admin')).toThrow();
});
