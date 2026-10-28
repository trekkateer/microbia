import { expect, it } from 'vitest';
import { pond } from './fixtures';
import { amoeba } from '../src/data/species/amoeba';
import { didinium } from '../src/data/species/didinium';
import { paramecium } from '../src/data/species/paramecium';
import { createWorld, createOrganism } from '../src/sim/world';
import { activateAbility, advanceAbility, attackOwner } from '../src/sim/systems/abilities';
import { contactKey } from '../src/sim/systems/collisions';
import { killOrganism } from '../src/sim/systems/lifecycle';
import { aiCommand } from '../src/sim/systems/ai';

function setup(hunter = amoeba as typeof amoeba | typeof didinium) {
  const w = createWorld({ ...pond, practiceTargets: [] }, hunter);
  const prey = createOrganism(paramecium, w.nutrition, 'prey', w.player.x + 60, w.player.y, 16);
  const rival = createOrganism(hunter, w.nutrition, 'rival', prey.x + 60, prey.y);
  w.organisms = [prey, rival]; w.foodParticles = [];
  return { w, prey, rival };
}
const aim = (a: { x: number; y: number }, b: { x: number; y: number }) => ({ x: b.x - a.x, y: b.y - a.y });

it('the first accepted attack wins even when that actor is later in the world list', () => {
  const { w, prey, rival } = setup();
  activateAbility(w, rival, aim(rival, prey), 30, prey.id);
  const energy = w.player.reserves.energy;
  activateAbility(w, w.player, aim(w.player, prey), 30, prey.id);
  expect(attackOwner(w, prey)).toBe(rival);
  expect(w.player.ability).toBeNull();
  expect(w.player.abilityMessage).toBe('Prey already under attack');
  expect(w.player.reserves.energy).toBe(energy); expect(w.player.cooldownUntil).toBe(0);
  w.tick = rival.ability!.until;
  advanceAbility(w, rival, rival, 30);
  expect(prey.alive).toBe(false); expect(rival.eaten).toBe(1); expect(w.player.eaten).toBe(0);
  expect(attackOwner(w, prey)).toBeUndefined();
});

it('a targeted Didinium strike reserves prey before contact without allowing another lunge', () => {
  const { w, prey, rival } = setup(didinium);
  activateAbility(w, rival, aim(rival, prey), 30, prey.id);
  activateAbility(w, w.player, aim(w.player, prey), 30, prey.id);
  expect(attackOwner(w, prey)).toBe(rival); expect(w.player.cooldownUntil).toBe(0);
  rival.x = prey.x - 55; rival.y = prey.y;
  w.contacts.add(contactKey(rival, prey));
  advanceAbility(w, rival, rival, 30);
  expect(rival.ability?.effect).toBe('capture');
  expect(attackOwner(w, prey)).toBe(rival);
});

it('contact feeding and untargeted strikes cannot steal claimed prey or apply a second stun', () => {
  const { w, prey, rival } = setup(didinium);
  prey.x = w.player.x + 55; rival.x = prey.x + 55; rival.y = prey.y;
  w.contacts.add(contactKey(rival, prey)); w.contacts.add(contactKey(w.player, prey));
  advanceAbility(w, rival, rival, 30);
  advanceAbility(w, w.player, w.player, 30);
  expect(rival.ability?.effect).toBe('capture'); expect(w.player.ability).toBeNull();
  w.player.ability = { effect: 'strike', startedAtTick: 0, until: 9, targetId: null, direction: { x: 1, y: 0 } };
  advanceAbility(w, w.player, w.player, 30);
  expect(prey.stunnedUntil).toBe(0); expect(w.player.ability?.effect).toBe('strike');
});

it.each(['escape', 'death', 'stun', 'discharge'])('releases the first claim on %s so another cell can attack', reason => {
  const { w, prey, rival } = setup();
  activateAbility(w, w.player, aim(w.player, prey), 30, prey.id);
  if (reason === 'escape') w.player.x -= 500;
  if (reason === 'death') killOrganism(w, w.player, 'test', 30);
  if (reason === 'stun') w.player.stunnedUntil = 30;
  if (reason === 'discharge') activateAbility(w, prey, aim(prey, w.player), 30);
  activateAbility(w, rival, aim(rival, prey), 30, prey.id);
  expect(rival.ability?.targetId).toBe(prey.id);
  expect(attackOwner(w, prey)).toBe(rival);
});

it('an expired missed strike releases its claim, and AI hunts unclaimed alternatives', () => {
  const { w, prey, rival } = setup(didinium);
  activateAbility(w, w.player, aim(w.player, prey), 30, prey.id);
  const alternative = createOrganism(paramecium, w.nutrition, 'other-prey', rival.x + 170, rival.y, 16);
  w.organisms.push(alternative);
  rival.ai = { profileId: 'hunter', mode: 'wander', direction: { x: 0, y: 0 }, decisionAt: 0, wanderAt: 0, wanderAngle: 0, targetId: null };
  aiCommand(w, rival, 30);
  expect(rival.ai.targetId).toBe(alternative.id);
  w.tick = w.player.ability!.until + 1;
  activateAbility(w, rival, aim(rival, prey), 30, prey.id);
  expect(attackOwner(w, prey)).toBe(rival);
});
