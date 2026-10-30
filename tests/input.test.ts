import { afterEach, expect, it, vi } from 'vitest';
import { Input } from '../src/client/input/input';

afterEach(() => vi.unstubAllGlobals());

it('keeps mouse steering over arena overlays and clears it outside the arena or window', () => {
  const windowEvents = new EventTarget();
  vi.stubGlobal('window', windowEvents);
  const canvas = new EventTarget() as HTMLCanvasElement;
  Object.assign(canvas, { clientWidth: 800, clientHeight: 600, getBoundingClientRect: () => ({ left: 20, top: 40, width: 800, height: 600 }) });
  const input = new Input(canvas);
  const move = (x: number, y: number) => {
    const event = new Event('pointermove');
    Object.assign(event, { pointerType: 'mouse', clientX: x, clientY: y });
    windowEvents.dispatchEvent(event);
  };
  move(720, 340);
  expect(input.read().direction.x).toBe(1);
  canvas.dispatchEvent(new Event('pointerleave'));
  move(120, 340); // A panel covers this point; movement targets the window, not the canvas.
  expect(input.read({ x: 1000, y: 1000, zoom: 2 }).target).toEqual({ x: 850, y: 1000 });
  expect(input.read().direction.x).toBe(-1);
  const internalOut = new Event('pointerout');
  Object.assign(internalOut, { relatedTarget: new EventTarget() });
  windowEvents.dispatchEvent(internalOut);
  expect(input.read().direction.x).toBe(-1);
  move(10, 340);
  expect(input.read().direction.x).toBe(0);
  move(720, 340);
  windowEvents.dispatchEvent(new Event('pointerout'));
  expect(input.read().direction.x).toBe(0);
  move(720, 340);
  windowEvents.dispatchEvent(new Event('blur'));
  expect(input.read().direction.x).toBe(0);
  input.destroy();
  move(720, 340);
  expect(input.read().direction.x).toBe(0);
});
