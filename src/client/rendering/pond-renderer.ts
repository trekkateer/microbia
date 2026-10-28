import { Application, Container, Graphics, GraphicsContext, Sprite, Text } from 'pixi.js';
import type { ArenaDefinition, NutritionDefinitions, SpeciesDefinition } from '../../data/schemas';
import type { WorldSnapshot } from '../../sim/types';
import type { Camera } from '../camera/camera';
import { drawFood } from './food';
import { membraneContour } from '../../sim/membrane';
import { FIXED_DT } from '../../sim/step';
import { organisms as roster } from '../../data';
import { AbilityAnimations } from './ability-animations';
import { drawAbilityEffect } from './ability-effects';
import { interpolatedPosition } from '../../sim/systems/collisions';
import { playerCells } from '../../sim/systems/player-control';
import { AbsorptionPulses } from './absorption-pulses';
import { EngulfAnimations } from './engulf-animation';
import type { EngulfVisual } from './engulf-animation';
import { pseudopodGeometry } from './pseudopods';
import { DivisionAnimations } from './division-animation';

function membrane(graphics: Graphics, radius: number, time: number, stretch: number, shape: SpeciesDefinition['visual']['shape']): void {
  graphics.poly(membraneContour(radius, time, stretch, shape).flatMap(p => [p.x, p.y]), true);
}

export class PondRenderer {
  private scene = new Container();
  private cell = new Container();
  private body = new Graphics();
  private organelles = new Graphics();
  private cilia = new Graphics();
  private interiors = new Map<string, GraphicsContext>();
  private pulse = new Graphics();
  private nutrientSprites: Sprite[] = [];
  private label: Text;
  private absorptionPulses = new AbsorptionPulses();
  private engulfAnimations = new EngulfAnimations();
  private abilityAnimations = new AbilityAnimations();
  private engulfLayer = new Container();
  private engulfGhosts = new Map<string, Graphics>();
  private time = 0;
  private lastNutrientTick = -1;
  private targets = new Container();
  private targetGraphics = new Map<string, { cell: Container; body: Graphics; interior: Graphics; label: Text; drawnTick: number; wasEngulfing: boolean }>();
  private effects = new Graphics();
  private currents = new Graphics();
  private divisionMembranes = new Graphics();
  private divisionAnimations: DivisionAnimations;

  constructor(private app: Application, private arena: ArenaDefinition, private species: SpeciesDefinition, private nutrition: NutritionDefinitions, initial: WorldSnapshot) {
    this.divisionAnimations = new DivisionAnimations(initial);
    this.app.stage.addChild(this.scene);
    this.createWater();
    this.createZones();
    this.scene.addChild(this.currents);
    const textures = new Map(arena.foodSpawns.map(spawn => {
      const graphic = drawFood(nutrition.foods[spawn.foodId]);
      const texture = app.renderer.generateTexture(graphic);
      graphic.destroy();
      return [spawn.foodId, texture];
    }));
    for (const nutrient of initial.foodParticles) {
      const sprite = new Sprite(textures.get(nutrient.foodId));
      sprite.anchor.set(0.5);
      sprite.position.set(nutrient.x, nutrient.y);
      sprite.rotation = nutrient.id * 2.4;
      this.nutrientSprites.push(sprite);
      this.scene.addChild(sprite);
    }
    this.scene.addChild(this.divisionMembranes, this.targets, this.pulse, this.cell, this.engulfLayer, this.effects);
    this.cell.addChild(this.body, this.organelles, this.cilia);
    for (const entry of Object.values(roster)) {
      const detail = new Graphics();
      this.drawOrganelles(detail, 34, entry.visual, 0);
      this.interiors.set(entry.id, detail.context);
      detail.destroy({ context: false });
    }
    this.organelles.context = this.interiors.get(species.id)!;
    this.label = new Text({ text: `YOU • ${species.name}`, style: { fontFamily: 'Arial, sans-serif', fontSize: 11, fill: 0xc9dcc4, letterSpacing: 1.5 } });
    this.label.anchor.set(0.5, 0);
    app.stage.addChild(this.label);
  }

  private createWater(): void {
    const { width, height } = this.arena.map;
    const theme = this.arena.theme;
    const background = new Graphics().rect(0, 0, width, height).fill(theme.water);
    // Decorative optics use their own deterministic sequence and cannot affect gameplay.
    let seed = 41;
    const rand = () => { seed = (Math.imul(seed, 1664525) + 1013904223) >>> 0; return seed / 4294967296; };
    for (let i = 0; i < 90; i++) {
      const x = rand() * width;
      const y = rand() * height;
      const radius = 25 + rand() * 130;
      for (let layer = 4; layer > 0; layer--) {
        background.circle(x, y, radius * layer / 3).fill({ color: i % 2 ? 0x85ac75 : 0x051e29, alpha: 0.025 });
      }
    }
    for (let x = 50; x < width; x += 100) {
      for (let y = 50; y < height; y += 100) background.circle(x, y, 0.8).fill({ color: theme.detail, alpha: 0.20 });
    }
    for (let i = 0; i < 330; i++) {
      const x = rand() * width;
      const y = rand() * height;
      background.ellipse(x, y, 1 + rand() * 2, 0.5 + rand()).fill({ color: theme.detail, alpha: 0.1 + rand() * 0.13 });
      if (i % 12 === 0) {
        background.moveTo(x, y).bezierCurveTo(x + 25, y - 30, x + 45, y + 35, x + 70, y + 5)
          .stroke({ width: 1.3, color: theme.detail, alpha: 0.10 });
      }
    }
    background.roundRect(3, 3, width - 6, height - 6, 18).stroke({ color: theme.detail, alpha: 0.4, width: 3 });
    this.scene.addChild(background);
  }

  private createZones(): void {
    for (const zone of this.arena.zones) {
      const color = zone.effectId === 'current' ? 0x70bdd1 : zone.light > 0 ? 0xe9d492 : 0x151e48;
      const shape = new Graphics();
      for (let layer = 6; layer > 0; layer--) shape.circle(zone.x, zone.y, zone.radius * layer / 6).fill({ color, alpha: zone.effectId === 'light' && zone.light === 0 ? 0.12 : 0.025 });
      shape.circle(zone.x, zone.y, zone.radius).stroke({ color, width: 1.5, alpha: 0.3 });
      this.scene.addChild(shape);
      const label = new Text({ text: zone.name.toUpperCase(), style: { fontFamily: 'Arial', fontSize: 11, letterSpacing: 2, fill: zone.effectId === 'light' && zone.light === 0 ? 0x9daacb : color } });
      label.anchor.set(0.5); label.position.set(zone.x, zone.y - zone.radius + 35); label.alpha = 0.6;
      this.scene.addChild(label);
    }
    for (const patch of this.arena.dissolvedPatches ?? []) {
      const outline = new Graphics().circle(patch.x, patch.y, patch.radius).stroke({ color: 0xa8d9b5, width: 1, alpha: 0.35 });
      for (let i = 0; i < 24; i++) { const a = i / 24 * Math.PI * 2; outline.circle(patch.x + Math.cos(a) * patch.radius, patch.y + Math.sin(a) * patch.radius, 2).fill({ color: 0xa8d9b5, alpha: 0.6 }); }
      this.scene.addChild(outline);
    }
  }

  render(previous: WorldSnapshot, current: WorldSnapshot, alpha: number, camera: Camera, delta: number): void {
    current = this.divisionAnimations.update(current, alpha, delta);
    const dividing = this.divisionAnimations.activeIds;
    if (dividing.size) {
      const visible = new Map([current.player, ...current.organisms].map(p => [p.id, p]));
      previous = { ...previous, player: dividing.has(previous.player.id) ? visible.get(previous.player.id)! : previous.player,
        organisms: previous.organisms.map(p => dividing.has(p.id) ? visible.get(p.id)! : p) };
    }
    this.divisionMembranes.clear();
    for (const { a, b, width } of this.divisionAnimations.necks) {
      if (width < 0.1) continue;
      const colors = roster[a.speciesId].visual;
      const dx = b.x - a.x, dy = b.y - a.y, length = Math.hypot(dx, dy) || 1;
      const nx = -dy / length, ny = dx / length;
      const ax = a.x + dx * 0.25, ay = a.y + dy * 0.25;
      const bx = b.x - dx * 0.25, by = b.y - dy * 0.25;
      const mx = (a.x + b.x) / 2, my = (a.y + b.y) / 2;
      this.divisionMembranes.moveTo(ax + nx * width, ay + ny * width)
        .quadraticCurveTo(mx, my, bx + nx * width, by + ny * width)
        .lineTo(bx - nx * width, by - ny * width)
        .quadraticCurveTo(mx, my, ax - nx * width, ay - ny * width).closePath()
        .fill({ color: colors.body, alpha: 0.26 }).stroke({ color: colors.membrane, alpha: 0.65, width: 1.5 });
    }
    this.time += delta;
    this.currents.clear();
    for (const zone of this.arena.zones) if (zone.effectId === 'current') {
      const angle = Math.atan2(zone.velocity.y, zone.velocity.x), dx = Math.cos(angle), dy = Math.sin(angle);
      for (let i = 0; i < 14; i++) {
        const offset = ((this.time * 30 + i * 57) % (zone.radius * 1.5)) - zone.radius * 0.75;
        const across = Math.sin(i * 2.4) * zone.radius * 0.5;
        const cx = zone.x + dx * offset - dy * across, cy = zone.y + dy * offset + dx * across;
        this.currents.moveTo(cx - dx * 14, cy - dy * 14).lineTo(cx + dx * 14, cy + dy * 14)
          .lineTo(cx + dx * 6 - dy * 5, cy + dy * 6 + dx * 5).moveTo(cx + dx * 14, cy + dy * 14)
          .lineTo(cx + dx * 6 + dy * 5, cy + dy * 6 - dx * 5).stroke({ color: 0x9edbe8, width: 1, alpha: 0.35 });
      }
    }
    const p = current.player;
    this.cell.visible = this.label.visible = p.alive;
    const mix = (a: number, b: number) => a + (b - a) * alpha;
    const { x, y } = interpolatedPosition(p, alpha);
    const oldPlayer = previous.player.id === p.id && previous.player.divisionCount === p.divisionCount ? previous.player : p;
    const radius = mix(oldPlayer.radius, p.radius);
    const controlled = playerCells(current);
    const center = controlled.length ? { x: 0, y: 0 } : { x, y };
    for (const cell of controlled) { const point = interpolatedPosition(cell, alpha); center.x += point.x / controlled.length; center.y += point.y / controlled.length; }
    const groupRadius = Math.sqrt(controlled.reduce((sum, cell) => sum + cell.radius ** 2, 0)) || radius;
    const spread = Math.max(radius, ...controlled.map(cell => { const point = interpolatedPosition(cell, alpha); return Math.hypot(point.x - center.x, point.y - center.y) + cell.radius * 1.4; }));
    const fitZoom = controlled.length > 1 ? Math.min(this.app.screen.width, this.app.screen.height) * 0.4 / spread : undefined;
    camera.update(center, groupRadius, this.species.growth.startingRadius, delta, fitZoom);
    this.scene.scale.set(camera.zoom);
    this.scene.position.set(this.app.screen.width / 2 - camera.x * camera.zoom, this.app.screen.height / 2 - camera.y * camera.zoom);
    const halfWidth = this.app.screen.width / (2 * camera.zoom), halfHeight = this.app.screen.height / (2 * camera.zoom);
    const inView = (x: number, y: number, padding: number) => Math.abs(x - camera.x) <= halfWidth + padding && Math.abs(y - camera.y) <= halfHeight + padding;
    const previousById = new Map([previous.player, ...previous.organisms].map(actor => [actor.id, actor]));
    this.cell.position.set(x, y);
    const headingDelta = Math.atan2(Math.sin(p.heading - oldPlayer.heading), Math.cos(p.heading - oldPlayer.heading));
    this.cell.rotation = oldPlayer.heading + headingDelta * alpha;
    const stretch = mix(oldPlayer.stretch, p.stretch);
    const membraneTime = mix(previous.tick, current.tick) * FIXED_DT;
    const engulfs = this.engulfAnimations.update(current, mix(previous.tick, current.tick), alpha, delta, roster);
    const palette = this.species.visual;
    this.body.clear();
    const playerEngulf = engulfs.get(p.id);
    if (playerEngulf) this.drawEngulf(this.body, radius, this.cell.rotation, stretch, membraneTime, palette, playerEngulf);
    else {
    membrane(this.body, radius * 1.08, membraneTime, stretch, palette.shape);
    this.body.fill({ color: palette.membrane, alpha: 0.035 });
    membrane(this.body, radius, membraneTime, stretch, palette.shape);
    this.body.fill({ color: palette.body, alpha: 0.24 }).stroke({ color: palette.membrane, alpha: 0.83, width: 1.5 });
    membrane(this.body, radius * 0.92, membraneTime + 0.08, stretch, palette.shape);
    this.body.stroke({ color: palette.membrane, alpha: 0.19, width: 2 / camera.zoom });
    }
    // Share immutable vector interiors. Scaling retains all organelles without
    // rebuilding and triangulating dozens of circles for every cell every frame.
    this.organelles.scale.set(radius / 34);
    this.cilia.clear();
    this.drawCilia(this.cilia, radius, palette, membraneTime);
    this.effects.clear();
    const present = new Set(current.organisms.map(actor => actor.id));
    for (const [id, visual] of this.targetGraphics) if (!present.has(id)) {
      visual.body.destroy();
      visual.interior.destroy({ context: false }); // Other cells still use this shared interior.
      visual.cell.destroy(); visual.label.destroy(); this.targetGraphics.delete(id);
    }
    for (const visual of this.targetGraphics.values()) visual.cell.visible = visual.label.visible = false;
    for (const target of current.organisms) {
      if (!target.alive) continue;
      const { x: tx, y: ty } = interpolatedPosition(target, alpha);
      // Include cilia, labels and long capture extensions in the culling margin.
      if (!inView(tx, ty, target.radius * 4 + 200)) continue;
      let visual = this.targetGraphics.get(target.id);
      if (!visual) {
        const body = new Graphics();
        const interior = new Graphics(this.interiors.get(target.speciesId)!);
        const cell = new Container(); cell.addChild(body, interior);
        const label = new Text({ text: '', style: { fontFamily: 'Arial', fontSize: 9, fill: 0xaec6b8, align: 'center' } });
        label.anchor.set(0.5, 0);
        visual = { cell, body, interior, label, drawnTick: -1, wasEngulfing: false };
        this.targetGraphics.set(target.id, visual);
        this.targets.addChild(cell, label);
      }
      visual.cell.visible = visual.label.visible = true;
      const prior = previousById.get(target.id);
      const old = prior?.generation === target.generation && prior.divisionCount === target.divisionCount ? prior : target;
      const targetRadius = mix(old.radius, target.radius);
      const colors = roster[target.speciesId].visual;
      const rotation = old.heading + Math.atan2(Math.sin(target.heading - old.heading), Math.cos(target.heading - old.heading)) * alpha;
      const engulf = engulfs.get(target.id);
      // Ordinary membranes/cilia deform at the simulation cadence. Position and
      // rotation still interpolate every frame; captures keep full-frame curves.
      // This avoids rebuilding and triangulating the same body between ticks.
      if (engulf || dividing.has(target.id) || visual.wasEngulfing || visual.drawnTick !== current.tick) {
        visual.body.clear();
        if (engulf) this.drawEngulf(visual.body, targetRadius, rotation, mix(old.stretch, target.stretch), membraneTime, colors, engulf);
        else {
          membrane(visual.body, targetRadius, membraneTime, mix(old.stretch, target.stretch), colors.shape);
          visual.body.fill({ color: colors.body, alpha: 0.26 }).stroke({ color: colors.membrane, width: 1.5, alpha: 0.8 });
        }
        this.drawCilia(visual.body, targetRadius, colors, membraneTime);
        visual.drawnTick = current.tick;
        visual.wasEngulfing = !!engulf;
      }
      visual.interior.scale.set(targetRadius / 34);
      visual.cell.position.set(tx, ty);
      visual.cell.rotation = rotation;
      visual.label.text = `${target.kind === 'player' ? 'YOU / ' : ''}${roster[target.speciesId].name} · ${target.mass.toFixed(0)}`;
      visual.label.style.fill = target.kind === 'player' ? 0xe2efc8 : target.kind === 'npc' ? 0xf2c0b0 : 0xaec6b8;
      visual.label.position.set(tx, ty + target.radius + 10);
    }
    const actors = [p, ...current.organisms];
    for (const [id, ghost] of this.engulfGhosts) if (engulfs.get(id)?.phase !== 'swallow') { ghost.destroy(); this.engulfGhosts.delete(id); }
    for (const [id, engulf] of engulfs) if (engulf.phase === 'swallow') {
      const actor = actors.find(cell => cell.id === id)!;
      const position = interpolatedPosition(actor, alpha);
      let ghost = this.engulfGhosts.get(id);
      if (!ghost) { ghost = new Graphics(); this.engulfGhosts.set(id, ghost); this.engulfLayer.addChild(ghost); }
      const colors = roster[engulf.prey.speciesId].visual, r = engulf.prey.radius * engulf.preyScale;
      const contour = membraneContour(r, membraneTime, 0, colors.shape);
      ghost.clear();
      ghost.ellipse(0, 0, Math.max(...contour.map(p => Math.abs(p.x))) + 4, Math.max(...contour.map(p => Math.abs(p.y))) + 4)
        .fill({ color: roster[actor.speciesId].visual.body, alpha: 0.18 }).stroke({ color: roster[actor.speciesId].visual.membrane, width: 1.3, alpha: 0.75 });
      membrane(ghost, r, membraneTime, 0, colors.shape);
      ghost.fill({ color: colors.body, alpha: 0.3 }).stroke({ color: colors.membrane, width: 1, alpha: 0.6 });
      this.drawOrganelles(ghost, r, colors, membraneTime);
      ghost.position.set(position.x + engulf.offset.x, position.y + engulf.offset.y);
      ghost.rotation = engulf.prey.heading;
      ghost.alpha = engulf.preyAlpha;
    }
    for (const actor of actors) {
      if (!actor.alive) continue;
      const position = interpolatedPosition(actor, alpha);
      const state = actor.ability;
      if (actor.protectedUntil > current.tick) this.effects.circle(position.x, position.y, actor.radius * 1.4 + 7).stroke({ color: 0xc7e6c0, width: 1, alpha: 0.22 + Math.sin(this.time * 5) * 0.08 });
      if (!state) continue;
    }
    for (const visual of this.abilityAnimations.update(current, mix(previous.tick, current.tick), alpha, roster)) {
      if (inView(visual.position.x, visual.position.y, visual.radius * 4 + 250)) drawAbilityEffect(this.effects, visual, roster[actors.find(actor => actor.id === visual.actorId)!.speciesId].visual.membrane, membraneTime);
    }
    this.pulse.clear();
    const pulses = this.absorptionPulses.update(controlled, current.tick, delta);
    for (const cell of controlled) {
      const age = pulses.get(cell.id);
      if (age === undefined) continue;
      const point = interpolatedPosition(cell, alpha);
      const old = [previous.player, ...previous.organisms].find(other => other.id === cell.id && other.generation === cell.generation && other.divisionCount === cell.divisionCount) ?? cell;
      const color = cell.lastFoodId ? this.nutrition.foods[cell.lastFoodId]?.color ?? roster[cell.speciesId].visual.membrane : this.arena.theme.nutrient;
      this.pulse.circle(point.x, point.y, mix(old.radius, cell.radius) * (1.08 + age * 0.6))
        .stroke({ color, alpha: (1 - age / 0.65) * 0.3, width: 1 });
    }
    if (this.lastNutrientTick !== current.tick) {
      for (let i = 0; i < current.foodParticles.length; i++) {
        const food = current.foodParticles[i];
        const sprite = this.nutrientSprites[i];
        sprite.visible = food.availableAtTick <= current.tick;
        sprite.position.set(food.x, food.y);
      }
      this.lastNutrientTick = current.tick;
    }
    this.label.position.set(this.app.screen.width / 2 + (x - camera.x) * camera.zoom, this.app.screen.height / 2 + (y - camera.y + radius * 1.25) * camera.zoom + 10);
  }

  private drawEngulf(graphics: Graphics, radius: number, heading: number, stretch: number, time: number, palette: SpeciesDefinition['visual'], visual: EngulfVisual): void {
    const geometry = pseudopodGeometry(radius, heading, stretch, time, visual, roster[visual.prey.speciesId].visual.shape);
    const points = geometry.outline;
    const first = points[0], last = points[points.length - 1];
    const trace = () => {
      graphics.moveTo((first.x + last.x) / 2, (first.y + last.y) / 2);
      for (let i = 0; i < points.length; i++) {
        const p = points[i], next = points[(i + 1) % points.length];
        graphics.quadraticCurveTo(p.x, p.y, (p.x + next.x) / 2, (p.y + next.y) / 2);
      }
      graphics.closePath();
    };
    trace();
    graphics.fill({ color: palette.body, alpha: 0.29 }).stroke({ color: palette.membrane, alpha: 0.09, width: 6 });
    trace();
    graphics.stroke({ color: palette.membrane, alpha: 0.88, width: 1.5 });
    // Streaming cytoplasmic granules give the broad arms volume and direction.
    for (const stream of geometry.streams) for (let i = 0; i < 7; i++) {
      const t = (time * 0.8 + i / 7) % 1, index = t * (stream.length - 1), a = Math.floor(index), f = index - a;
      const p = stream[a], q = stream[Math.min(a + 1, stream.length - 1)];
      graphics.circle(p.x + (q.x - p.x) * f, p.y + (q.y - p.y) * f, radius * (i % 3 ? 0.025 : 0.043))
        .fill({ color: palette.membrane, alpha: 0.16 + Math.sin(t * Math.PI) * 0.2 });
    }
  }

  private drawOrganelles(graphics: Graphics, radius: number, colors: SpeciesDefinition['visual'], time: number): void {
    // Player and AI cells always share the same interior detail.
    for (let i = 0; i < 23; i++) {
      const angle = i * 2.399 + time * 0.025;
      const distance = radius * (0.3 + (i % 5) * 0.105);
      const ox = Math.cos(angle) * distance;
      const oy = Math.sin(angle) * distance * (colors.shape === 'diatom' ? 0.2 : colors.shape === 'slipper' || colors.shape === 'flagellate' ? 0.5 : 0.85);
      graphics.circle(ox, oy, radius * (i % 4 === 0 ? 0.105 : 0.028))
        .fill({ color: i % 4 === 0 ? colors.nucleus : colors.membrane, alpha: 0.35 })
        .stroke({ color: colors.membrane, alpha: 0.16, width: 0.6 });
    }
    graphics.ellipse(-radius * 0.12, radius * 0.04, radius * 0.23, radius * (colors.shape === 'diatom' ? 0.12 : 0.20))
      .fill({ color: colors.nucleus, alpha: 0.8 }).stroke({ color: colors.membrane, alpha: 0.45, width: 1.1 });
    graphics.circle(-radius * 0.16, radius * 0.01, radius * 0.08).fill({ color: colors.membrane, alpha: 0.33 });
  }

  private drawCilia(graphics: Graphics, radius: number, colors: SpeciesDefinition['visual'], time: number): void {
    if (colors.shape === 'amoeboid') return;
    if (colors.shape === 'flagellate') {
      graphics.circle(radius * 0.65, -radius * 0.13, radius * 0.085).fill({ color: 0xdb714f, alpha: 0.9 });
      for (let i = 0; i < 5; i++) graphics.ellipse((i - 2) * radius * 0.3, Math.sin(i * 2) * radius * 0.2, radius * 0.14, radius * 0.10).fill({ color: 0x85be4c, alpha: 0.6 });
      graphics.moveTo(radius * 1.18, 0).bezierCurveTo(radius * 1.4, Math.sin(time * 9) * radius * 0.4, radius * 1.7, -radius * 0.4, radius * 1.85, Math.sin(time * 9 + 2) * radius * 0.3).stroke({ color: colors.membrane, width: 0.9, alpha: 0.6 });
      return;
    }
    if (colors.shape === 'diatom') {
      graphics.moveTo(-radius * 1.05, 0).lineTo(radius * 1.05, 0).stroke({ color: colors.membrane, alpha: 0.65, width: 1 });
      for (let i = -9; i <= 9; i++) {
        const x = i * radius * 0.115, h = radius * 0.29 * (1 - (i / 11) ** 2);
        graphics.moveTo(x, -h).lineTo(x, h).stroke({ color: colors.membrane, alpha: 0.3, width: 0.7 });
      }
      return;
    }
    const points = membraneContour(radius, time, 0, colors.shape);
    for (let i = 0; i < points.length; i += 3) {
      const p = points[i];
      if (colors.shape === 'barrel' && Math.abs(p.x) > radius * 0.7) continue;
      graphics.moveTo(p.x, p.y).lineTo(p.x * 1.13 + Math.sin(time * 12 + i) * 2, p.y * 1.15)
        .stroke({ color: colors.membrane, alpha: 0.5, width: 0.7 });
    }
    if (colors.shape === 'barrel') graphics.ellipse(radius * 0.93, 0, radius * 0.16, radius * 0.2).stroke({ color: colors.membrane, width: 1 });
  }
}
