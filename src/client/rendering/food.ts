import { Graphics } from 'pixi.js';
import type { FoodDefinition } from '../../data/schemas';

export function drawFood(food: FoodDefinition): Graphics {
  const g = new Graphics();
  const r = food.radius;
  g.circle(0, 0, r * 2.5).fill({ color: food.color, alpha: 0.055 });
  switch (food.shape) {
    case 'circle': g.circle(0, 0, r); break;
    case 'diamond': g.poly([0, -r * 1.2, r, 0, 0, r * 1.2, -r, 0]); break;
    case 'capsule': g.roundRect(-r * 1.2, -r * 0.65, r * 2.4, r * 1.3, r * 0.65); break;
    case 'cluster':
      g.circle(-r * 0.45, r * 0.25, r * 0.55).circle(r * 0.45, r * 0.25, r * 0.55).circle(0, -r * 0.45, r * 0.55);
      break;
  }
  g.fill({ color: food.color, alpha: 0.9 });
  g.circle(-r * 0.2, -r * 0.2, 1).fill({ color: 0xffffff, alpha: 0.5 });
  return g;
}
