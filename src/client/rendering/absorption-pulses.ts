import type { PlayerState } from '../../sim/types';

// Visual timing is per organism and never changes the simulation.
export class AbsorptionPulses {
  private states = new Map<string, { generation: number; tick: number; age: number }>();

  update(cells: PlayerState[], tick: number, delta: number): Map<string, number> {
    const present = new Set(cells.map(cell => cell.id));
    for (const id of this.states.keys()) if (!present.has(id)) this.states.delete(id);
    const visible = new Map<string, number>();
    for (const cell of cells) {
      let state = this.states.get(cell.id);
      if (!state || state.generation !== cell.generation) {
        state = { generation: cell.generation, tick: -1, age: 1 };
        this.states.set(cell.id, state);
      }
      // Let continuous dissolved uptake complete a pulse before beginning another.
      if (cell.lastAbsorbedTick > state.tick) {
        if (tick - cell.lastAbsorbedTick <= 2 && state.age >= 0.65) state.age = 0;
        state.tick = cell.lastAbsorbedTick;
      }
      state.age += delta;
      if (state.age < 0.65) visible.set(cell.id, state.age);
    }
    return visible;
  }
}
