import type { MoveCommand } from '../../sim/commands';

const movementKeys = new Set(['KeyW', 'KeyA', 'KeyS', 'KeyD', 'ArrowUp', 'ArrowDown', 'ArrowLeft', 'ArrowRight']);

export class Input {
  private keys = new Set<string>();
  private pointer: { x: number; y: number } | null = null;
  private controller = new AbortController();
  private pendingAbility = false;
  private pendingRespawn = false;
  private pendingReproduction = false;

  constructor(private canvas: HTMLCanvasElement) {
    const signal = this.controller.signal;
    window.addEventListener('keydown', event => {
      if (event.target instanceof HTMLButtonElement) return;
      if (event.code === 'Space') { event.preventDefault(); if (!event.repeat) this.pendingAbility = true; }
      if (event.code === 'KeyR') { event.preventDefault(); if (!event.repeat) this.pendingReproduction = true; }
      if (movementKeys.has(event.code)) {
        event.preventDefault();
        this.keys.add(event.code);
        this.pointer = null;
      }
    }, { signal });
    window.addEventListener('keyup', event => { this.keys.delete(event.code); }, { signal });
    window.addEventListener('blur', () => this.reset(), { signal });
    window.addEventListener('pointermove', event => {
      if (event.pointerType !== 'mouse') return;
      const bounds = canvas.getBoundingClientRect();
      const x = event.clientX - bounds.left, y = event.clientY - bounds.top;
      this.pointer = x >= 0 && y >= 0 && x < bounds.width && y < bounds.height ? { x, y } : null;
    }, { signal });
    window.addEventListener('pointerout', event => { if (!event.relatedTarget) this.pointer = null; }, { signal });
    canvas.addEventListener('pointerdown', () => canvas.focus(), { signal });
  }

  read(camera?: { x: number; y: number; zoom: number }): MoveCommand {
    const activate = this.pendingAbility;
    const respawn = this.pendingRespawn;
    const reproduce = this.pendingReproduction;
    this.pendingAbility = false;
    this.pendingRespawn = false;
    this.pendingReproduction = false;
    const held = (...codes: string[]) => codes.some(code => this.keys.has(code)) ? 1 : 0;
    const x = held('KeyD', 'ArrowRight') - held('KeyA', 'ArrowLeft');
    const y = held('KeyS', 'ArrowDown') - held('KeyW', 'ArrowUp');
    if (this.keys.size) return { direction: { x, y }, activate, respawn, reproduce };
    if (!this.pointer) return { direction: { x: 0, y: 0 }, activate, respawn, reproduce };
    const dx = this.pointer.x - this.canvas.clientWidth / 2;
    const dy = this.pointer.y - this.canvas.clientHeight / 2;
    const distance = Math.hypot(dx, dy);
    // A central dead zone makes it possible to rest; approach it at reduced speed.
    const strength = Math.max(0, Math.min(1, (distance - 25) / 90));
    return { direction: { x: distance ? dx / distance * strength : 0, y: distance ? dy / distance * strength : 0 }, target: camera ? { x: camera.x + dx / camera.zoom, y: camera.y + dy / camera.zoom } : undefined, activate, respawn, reproduce };
  }

  activate(): void { this.pendingAbility = true; }
  reproduce(): void { this.pendingReproduction = true; }
  respawn(): void { this.reset(); this.pendingRespawn = true; }
  reset(): void { this.keys.clear(); this.pointer = null; this.pendingAbility = false; this.pendingRespawn = false; this.pendingReproduction = false; }
  destroy(): void { this.controller.abort(); }
}
