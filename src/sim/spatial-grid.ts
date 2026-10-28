import type { Vec2 } from './types';

// Point broad phase only: callers still perform exact geometry/diet checks.
// Results retain source order so contested food keeps deterministic ownership.
export class SpatialGrid<T extends Vec2> {
  private buckets = new Map<number, Map<number, number[]>>();

  constructor(private points: readonly T[], private cellSize = 128) {
    for (let i = 0; i < points.length; i++) {
      const x = Math.floor(points[i].x / cellSize), y = Math.floor(points[i].y / cellSize);
      let column = this.buckets.get(x);
      if (!column) { column = new Map(); this.buckets.set(x, column); }
      const bucket = column.get(y);
      if (bucket) bucket.push(i); else column.set(y, [i]);
    }
  }

  query(minX: number, minY: number, maxX: number, maxY: number): T[] {
    const indices: number[] = [];
    for (let x = Math.floor(minX / this.cellSize); x <= Math.floor(maxX / this.cellSize); x++) {
      const column = this.buckets.get(x);
      if (!column) continue;
      for (let y = Math.floor(minY / this.cellSize); y <= Math.floor(maxY / this.cellSize); y++) {
        const bucket = column.get(y);
        if (bucket) for (const index of bucket) indices.push(index);
      }
    }
    indices.sort((a, b) => a - b);
    return indices.map(index => this.points[index]);
  }
}
