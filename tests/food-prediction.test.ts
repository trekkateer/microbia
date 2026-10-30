import { expect, it } from 'vitest';
import { FoodPrediction } from '../src/client/food-prediction';
import { species } from '../src/data';
import { nutrition } from '../src/data/nutrition';
import { Room } from '../src/server/room';
import { worldContour } from '../src/sim/membrane';

function scene() {
  const room = new Room('food-contact');
  room.join('a', 'a', 'paramecium-caudatum');
  const state = room.state('a');
  state.organisms = [];
  state.player.x = 1000; state.player.y = 1000;
  state.player.ownerId = 'a'; state.player.heading = 0;
  const visual = { ...state, player: { ...state.player, x: 1040 } };
  const contour = worldContour({ ...visual.player, time: state.tick / 30, shape: 'slipper' });
  const edge = contour.reduce((a, b) => a.x > b.x ? a : b);
  state.foodParticles = [{ id: 1, foodId: 'carbon-flake', availableAtTick: 0, x: edge.x + nutrition.foods['carbon-flake'].radius - 0.5, y: edge.y }];
  visual.foodParticles = state.foodParticles;
  return { state, visual, predictor: new FoodPrediction(species, nutrition) };
}

it('previews pickup at the predicted membrane edge, without changing food or awarding resources', () => {
  const { state, visual, predictor } = scene();
  const original = JSON.stringify(state);
  expect(predictor.update(state, state, 'a', 0, 0).has(1)).toBe(false);
  expect(predictor.update(state, visual, 'a', 1 / 60, 0.1).has(1)).toBe(true);
  expect(JSON.stringify(state)).toBe(original);
  expect(visual.player.eaten).toBe(state.player.eaten);
  expect(visual.player.nutrients).toEqual(state.player.nutrients);
});

it('restores unconfirmed or stale pickups without repeatedly hiding rejected food', () => {
  const { state, visual, predictor } = scene();
  expect(predictor.update(state, visual, 'a', 0, 0.1).has(1)).toBe(true);
  expect(predictor.update(state, visual, 'a', 0.51, 0.1).has(1)).toBe(false);
  expect(predictor.update(state, visual, 'a', 0, 0.1).has(1)).toBe(false);
  predictor.reset();
  expect(predictor.update(state, visual, 'a', 0, 0.6).has(1)).toBe(false);
});

it('clears speculation when food relocates or life changes, and ignores incompatible food', () => {
  const { state, visual, predictor } = scene();
  expect(predictor.update(state, visual, 'a', 0, 0).has(1)).toBe(true);
  const next = { ...state, tick: state.tick + 2, foodParticles: [{ ...state.foodParticles[0], x: 2000 }] };
  expect(predictor.update(next, { ...visual, tick: next.tick }, 'a', 0, 0).size).toBe(0);
  predictor.reset();
  const hunter = { ...visual, player: { ...visual.player, speciesId: 'didinium-nasutum' } };
  expect(predictor.update(state, hunter, 'a', 0, 0).size).toBe(0);
  predictor.reset();
  predictor.update(state, visual, 'a', 0, 0);
  expect(predictor.update(state, { ...visual, player: { ...visual.player, alive: false } }, 'a', 0, 0).size).toBe(0);
});

it('authoritative feeding absorbs food touching the membrane while its center remains outside', () => {
  const room = new Room('edge'); room.join('a', 'a', 'paramecium-caudatum');
  const actor = room.world.organisms.find(p => p.ownerId === 'a')!;
  room.world.organisms = [actor]; room.world.arena = { ...room.world.arena, zones: [] };
  actor.x = 1000; actor.y = 1000; actor.heading = 0;
  const edge = worldContour({ ...actor, time: 1 / 30, shape: 'slipper' }).reduce((a, b) => a.x > b.x ? a : b);
  room.world.foodParticles = [{ id: 1, foodId: 'carbon-flake', availableAtTick: -1, x: edge.x + nutrition.foods['carbon-flake'].radius - 0.5, y: edge.y }];
  const eaten = actor.eaten; room.advance();
  expect(actor.eaten).toBe(eaten + 1);
});
