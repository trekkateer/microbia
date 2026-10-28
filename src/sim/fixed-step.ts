import { FIXED_DT } from './step';

export class FixedStepClock {
  private accumulator = 0;

  advance(seconds: number, onStep: () => void): number {
    // Drop long stalls: returning to a background tab must not fast-forward the world.
    this.accumulator += Number.isFinite(seconds) ? Math.max(0, Math.min(seconds, 0.25)) : 0;
    while (this.accumulator + 1e-10 >= FIXED_DT) {
      onStep();
      this.accumulator = Math.max(0, this.accumulator - FIXED_DT);
    }
    return this.accumulator / FIXED_DT;
  }

  reset(): void { this.accumulator = 0; }
}
