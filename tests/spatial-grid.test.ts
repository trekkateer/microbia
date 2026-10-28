import { expect, it } from 'vitest';
import { SpatialGrid } from '../src/sim/spatial-grid';

it('nearby lookup includes exact-boundary, negative and multi-bucket paths in source order', () => {
  const points = Array.from({ length: 1000 }, (_, id) => ({ id, x: (id * 97 % 2000) - 1000, y: (id * 53 % 2000) - 1000 }));
  points.push({ id: 1000, x: 128, y: -128 });
  const grid = new SpatialGrid(points);
  for (let i = 0; i < 60; i++) {
    const minX = -1000 + i * 23, minY = -500 + i * 7, maxX = minX + i * 11, maxY = minY + 300;
    const inside = (p: typeof points[number]) => p.x >= minX && p.x <= maxX && p.y >= minY && p.y <= maxY;
    expect(grid.query(minX, minY, maxX, maxY).filter(inside)).toEqual(points.filter(inside));
  }
  expect(grid.query(128, -128, 128, -128)).toContain(points[1000]);
});
