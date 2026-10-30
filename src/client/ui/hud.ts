import type { ArenaDefinition, NutritionDefinitions, SpeciesDefinition } from '../../data/schemas';
import type { PlayerState } from '../../sim/types';
import { foodYields, limitingResource } from '../../sim/systems/metabolism';
import { abilities } from '../../data/abilities/pond';
import { organisms as roster } from '../../data';
import { TICK_RATE } from '../../sim/step';
import { contains, environmentAt } from '../../sim/systems/environment';
import { reproductionBlock } from '../../sim/systems/reproduction';
import { playerCells } from '../../sim/systems/player-control';
import { HUNGER } from '../../sim/systems/hunger';
import { selectionHref } from '../../network/room-url';

export function createHud(root: HTMLElement, arena: ArenaDefinition, species: SpeciesDefinition, nutrition: NutritionDefinitions, room?: string) {
  const selectionUrl = room ? selectionHref(room) : './';
  const profile = nutrition.metabolism[species.metabolismId];
  const ability = abilities[species.activeId!];
  const menu = arena.foodSpawns.map(spawn => nutrition.foods[spawn.foodId]).filter(food => species.diet.includes(food.id));
  const producer = !!species.photosynthesis;
  const dietNote = producer ? `Stay in pale green nutrient patches to absorb dissolved resources. Light powers photosynthesis.${species.defense ? ' Silicate is needed for new shell material.' : ' Darkness slowly drains mass.'}` : species.diet.length ? '' : 'Your diet: Paramecium. Touch prey to feed; Space speeds the hunt.';
  root.innerHTML = `
    <header class="site-header">
      <a class="brand" href="/" aria-label="microbia home"><span class="brand-cell" aria-hidden="true"></span>microbia</a>
      <div class="build-tag"><span></span> LIVING POND <b>M4</b></div>
    </header>
    <main class="viewport" aria-label="Pond Water game">
      <div id="game"></div>
      <div class="vignette" aria-hidden="true"></div>
      <div class="arena-heading overlay"><div class="eyebrow"><span class="live-dot"></span> FRESHWATER / 01</div><h1></h1><p></p><div class="sandbox-actions"><a href="${selectionUrl}">Change species</a><span id="population"></span></div><p id="environment-status"></p></div>
      <section class="food-guide overlay" aria-label="Food guide"><div class="eyebrow">FOOD IN THIS DROP</div><ul id="food-legend"></ul>${dietNote ? `<p class="diet-note">${dietNote}</p>` : ''}<p class="zone-key">Gold: light · Indigo: shade<br>Blue arrows: cold current<br>Green rings: dissolved nutrients</p></section>
      <div id="loading" role="status">Bringing the pond into focus…</div>
      <section id="death-panel" class="death-panel" role="region" aria-label="Life ended" hidden><div><div class="eyebrow">THE POND GOES ON</div><h2>A small life ends.</h2><p id="death-reason"></p><p>Return as the same species with fresh reserves.</p><button id="respawn" type="button">Respawn</button><a href="${selectionUrl}">Choose another species</a></div></section>
      <section class="species-card overlay" aria-label="Your organism"><div class="eyebrow">YOUR ORGANISM</div><h2></h2><p></p><div class="ability-panel"><button id="activate-ability" type="button"><kbd>Space</kbd> ${ability.name}</button><output id="ability-status">Ready</output><small>${Object.entries(ability.costs).map(([id, cost]) => `${cost} ${id}`).join(' + ')} · ${ability.cooldown}s cooldown</small><span id="ability-message"></span></div><details class="kit-details"><summary>${species.passive.name} · passive & weakness</summary><p>${species.passive.description}</p><p>Weakness: ${species.weakness}</p></details><details class="nutrient-inventory"><summary>Absorbed nutrients</summary><ul id="nutrient-inventory" aria-label="Current absorbed nutrients"></ul><p class="inventory-note">Current stock, including food digesting. Amounts fall as nutrients are used. Division shares these resources equally.</p></details></section>
      <div class="control-hint overlay"><span>Mouse</span> to steer <i>·</i> <span>W A S D</span> or <span>↑ ← ↓ →</span> to move</div>
      <section class="growth-card overlay" aria-label="Growth stats"><div class="eyebrow">BIOMASS <span id="growth-label">FORAGING</span></div><div class="mass-line"><output id="mass" aria-label="Biomass">25</output><span>mass</span><div class="eaten-count"><output id="eaten" aria-label="Foods eaten">0</output><small>FOODS</small></div></div><div class="growth-track" role="progressbar" aria-label="Growth to maximum mass" aria-valuemin="25" aria-valuemax="225" aria-valuenow="25"><div id="growth-fill"></div></div><div class="energy-row"><span>ENERGY</span><output id="energy" aria-label="Energy level"></output></div><div class="energy-track" role="progressbar" aria-label="Energy reserve"><div id="energy-fill"></div></div><div class="hunger-row"><span>HUNGER</span><output id="hunger" aria-label="Hunger level">100%</output></div><div class="hunger-track" role="progressbar" aria-label="Nourishment" aria-valuemin="0" aria-valuemax="100"><div id="hunger-fill"></div></div><p id="hunger-status"></p><p id="nutrition-status"></p><p id="food-advice"></p><div id="digestion-status"></div></section>
    </main>
    <footer class="site-footer"><span><span class="footer-dot"></span> LOCAL POND <i>/</i> FIVE SINGLE-CELLED SPECIES</span><span>ONE DROP. A WHOLE WORLD.</span></footer>
  `;
  const get = <T extends HTMLElement>(selector: string) => root.querySelector<T>(selector)!;
  const reproductionPanel = document.createElement('div');
  reproductionPanel.className = 'reproduction-panel';
  reproductionPanel.innerHTML = '<button id="reproduce" type="button"><kbd>R</kbd> Divide</button><output id="reproduction-status" aria-live="polite"></output><small id="cell-count"></small><span id="reproduction-message"></span>';
  get('.kit-details').before(reproductionPanel);
  get('.inventory-note').textContent = 'Total unused stock across your cells, including digesting food. Division shares each cell’s biomass and nutrients equally.';
  const inventoryRows = Object.values(nutrition.nutrients).map(nutrient => {
    const item = document.createElement('li');
    item.dataset.nutrientId = nutrient.id;
    const relevant = !!(profile.assimilation[nutrient.id] || species.dissolvedUptake?.[nutrient.id]);
    item.hidden = !relevant;
    const name = document.createElement('span');
    name.textContent = nutrient.name;
    const amount = document.createElement('output');
    amount.setAttribute('aria-label', `${nutrient.name} stored`);
    const uses = document.createElement('small');
    uses.textContent = nutrient.uses.map(use => use === 'reproduction' ? 'Reproduction' : use === 'biomass' ? 'Biomass' : 'Energy').join(' · ');
    item.append(name, amount, uses);
    get('#nutrient-inventory').appendChild(item);
    return { id: nutrient.id, amount, item, relevant };
  });
  for (const food of menu) {
    const item = document.createElement('li');
    const icon = document.createElement('span');
    icon.className = 'food-symbol';
    icon.dataset.shape = food.shape;
    icon.style.setProperty('--food-color', `#${food.color.toString(16).padStart(6, '0')}`);
    icon.setAttribute('aria-hidden', 'true');
    const text = document.createElement('span');
    const name = document.createElement('strong');
    name.textContent = food.name;
    const detail = document.createElement('small');
    detail.textContent = food.summary;
    text.append(name, detail);
    item.append(icon, text);
    get('#food-legend').appendChild(item);
  }
  if (producer) {
    for (const id of Object.keys(species.dissolvedUptake ?? {})) {
      const item = document.createElement('li');
      const name = document.createElement('strong'), detail = document.createElement('small');
      const text = document.createElement('span');
      name.textContent = nutrition.nutrients[id].name;
      detail.textContent = id === species.photosynthesis!.input ? 'Carbon + light → organic food' : id === 'silicate' ? 'New silica shell material' : id === 'phosphate' ? 'Phosphorus for growth' : 'Nitrogen for growth';
      text.append(name, detail); item.append(text); get('#food-legend').append(item);
    }
  }
  get('h1').textContent = arena.name;
  get('.arena-heading p').textContent = arena.subtitle;
  get('.species-card h2').textContent = species.scientificName;
  get('.species-card p').textContent = species.description;
  if (!species.diet.length) get('.control-hint').firstChild!.textContent = producer ? 'Find light. Absorb dissolved nutrients. Grow.' : 'Hunt Paramecium to sustain your energy.';
  const abilityStatus = get<HTMLOutputElement>('#ability-status');
  const mass = get<HTMLOutputElement>('#mass');
  const eaten = get<HTMLOutputElement>('#eaten');
  const fill = get('#growth-fill');
  const progress = get('.growth-track');
  const label = get('#growth-label');
  const energy = get<HTMLOutputElement>('#energy');
  const energyFill = get('#energy-fill');
  const energyTrack = get('.energy-track');
  const status = get('#nutrition-status');
  const advice = get('#food-advice');
  const digestion = get('#digestion-status');
  const energyCapacity = profile.reserves[profile.energyReserveId].capacity;
  energyTrack.setAttribute('aria-valuemin', '0');
  energyTrack.setAttribute('aria-valuemax', String(energyCapacity));
  progress.setAttribute('aria-valuemin', String(species.starvation.minimumMass));
  progress.setAttribute('aria-valuemax', String(species.growth.maximumMass));
  return {
    host: get('#game'),
    loading: get('#loading'),
    activate: get<HTMLButtonElement>('#activate-ability'),
    reproduce: get<HTMLButtonElement>('#reproduce'),
    respawn: get<HTMLButtonElement>('#respawn'),
    update(player: PlayerState, tick: number, organisms: PlayerState[]) {
      const context = { player, organisms, arena, tick, roster };
      const cells = playerCells(context);
      const count = Math.max(1, cells.length);
      const readyToDivide = cells.filter(p => !reproductionBlock(context, p));
      const biggest = [...cells].sort((a, b) => b.mass - a.mass)[0] ?? player;
      get('#reproduction-status').textContent = readyToDivide.length ? `Ready · ${readyToDivide.length} ${readyToDivide.length === 1 ? 'cell' : 'cells'}` : reproductionBlock(context, biggest);
      get('#reproduce').setAttribute('aria-disabled', String(readyToDivide.length === 0));
      get('#cell-count').textContent = `${cells.length} ${cells.length === 1 ? 'cell' : 'cells'} under your control · ${Math.round((species.reproduction?.threshold ?? 1) * 100)}% per cell to divide`;
      get('#reproduction-message').textContent = cells.find(p => p.reproductionMessage)?.reproductionMessage ?? '';
      const abilityCell = [...cells].sort((a, b) => b.cooldownUntil - a.cooldownUntil)[0] ?? player;
      const canActivate = (p: PlayerState) => p.alive && p.protectedUntil <= tick && p.stunnedUntil <= tick && !p.ability && p.cooldownUntil <= tick && Object.entries(ability.costs).every(([id, cost]) => p.reserves[id] >= cost);
      const env = environmentAt(arena, biggest);
      const inPatch = (arena.dissolvedPatches ?? []).some(patch => contains(patch, biggest));
      get('#environment-status').textContent = `${cells.length > 1 ? 'Largest cell: ' : ''}${env.light === 0 ? 'Deep shade' : env.light >= 0.8 ? 'Sunlit water' : 'Dim water'}${env.speedMultiplier < 1 ? ' · Cold current' : ''}${inPatch ? ' · Nutrient patch' : ''}`;
      get('#population').textContent = `${organisms.filter(p => p.alive && p.kind !== 'player').length} neighbors · Single-celled life`;
      get('#death-panel').hidden = player.alive;
      get('#death-reason').textContent = player.deathReason;
      const respawn = get<HTMLButtonElement>('#respawn');
      const remaining = Math.max(0, Math.ceil((player.respawnAtTick - tick) / TICK_RATE));
      respawn.disabled = remaining > 0;
      respawn.textContent = remaining > 0 ? `Respawn in ${remaining}s` : 'Respawn';
      const cooldown = Math.max(0, (abilityCell.cooldownUntil - tick) / TICK_RATE);
      const missing = Object.entries(ability.costs).filter(([id, cost]) => abilityCell.reserves[id] < cost).map(([id]) => id);
      abilityStatus.value = !player.alive ? 'Life ended' : abilityCell.protectedUntil > tick ? `Settling in · ${Math.ceil((abilityCell.protectedUntil - tick) / TICK_RATE)}s` : abilityCell.stunnedUntil > tick ? 'Stunned' : abilityCell.ability ? 'Active' : cooldown > 0 ? `${cooldown.toFixed(1)}s` : missing.length ? `Need ${missing.join(' + ')}` : 'Ready';
      if (cells.length > 1 && cells.some(canActivate)) abilityStatus.value = `${cells.filter(canActivate).length}/${cells.length} cells ready`;
      get('#activate-ability').setAttribute('aria-disabled', String(!cells.some(canActivate)));
      get('#ability-message').textContent = abilityCell.abilityMessage;
      // Biomass and inventory summarize the colony; feeding advice follows its
      // largest cell so a well-fed sibling cannot hide another cell's shortage.
      const totalMass = cells.reduce((sum, p) => sum + p.mass, 0) || player.mass;
      for (const row of inventoryRows) {
        const amount = cells.reduce((sum, p) => sum + (p.nutrients[row.id] ?? 0), 0);
        row.item.hidden = !row.relevant && amount <= 0;
        row.amount.value = amount > 0 && amount < 0.1 ? '<0.1' : amount.toLocaleString('en-US', { maximumFractionDigits: 1 });
      }
      mass.value = Number(totalMass.toFixed(1)).toString();
      eaten.value = String(cells.reduce((sum, p) => sum + p.eaten, 0));
      const g = species.growth;
      fill.style.width = `${Math.max(0, 100 * (totalMass - g.startingMass * count) / Math.max(1, (g.maximumMass - g.startingMass) * count))}%`;
      progress.setAttribute('aria-valuenow', String(totalMass));
      progress.setAttribute('aria-valuemax', String(g.maximumMass * count));
      const full = totalMass >= g.maximumMass * count;
      label.textContent = full ? 'FULLY GROWN' : player.growthRate > 0 ? 'GROWING' : player.digestion.length ? 'DIGESTING' : 'FORAGING';
      const energyValue = cells.reduce((sum, p) => sum + p.reserves[profile.energyReserveId], 0);
      energy.value = `${Math.round(energyValue / (energyCapacity * count) * 100)}%`;
      energyFill.style.width = `${energyValue / (energyCapacity * count) * 100}%`;
      energyTrack.setAttribute('aria-valuemax', String(energyCapacity * count));
      energyTrack.setAttribute('aria-valuenow', energyValue.toFixed(1));
      const hungriest = cells.reduce<PlayerState | null>((worst, cell) => !worst || cell.satiety < worst.satiety ? cell : worst, null);
      const satiety = hungriest?.satiety ?? 0;
      const starvingCount = cells.filter(p => p.satiety <= 1e-9).length;
      const hungerState = satiety <= 1e-9 ? 'starving' : satiety <= HUNGER.warning ? 'low' : 'fed';
      get('#hunger').textContent = Math.round(satiety * 100) + '%';
      get('#hunger-fill').style.width = (satiety * 100) + '%';
      const hungerTrack = get('.hunger-track'); hungerTrack.dataset.state = hungerState;
      hungerTrack.setAttribute('aria-valuenow', String(Math.round(satiety * 100)));
      hungerTrack.setAttribute('aria-valuetext', cells.length > 1 ? 'Least-fed cell: ' + Math.round(satiety * 100) + '%' : Math.round(satiety * 100) + '% nourished');
      get('#hunger-status').textContent = !player.alive ? 'Life ended' : starvingCount ? 'Starving — losing biomass. ' + (cells.length > 1 ? starvingCount + ' cells need food.' : 'Eat before starvation kills you.') : hungerState === 'low' ? 'Hungry — replenish a balanced diet before dividing.' : cells.length > 1 ? 'Least-fed cell · every cell needs its own food.' : producer ? 'Light and dissolved nutrients sustain you.' : 'Keep eating a mixture of food to stay nourished.';
      const limiting = limitingResource(biggest, profile);
      status.textContent = full ? 'Maximum size reached' : limiting ? `Low ${profile.reserves[limiting].name}` : 'Balanced reserves';
      if (!full && limiting) {
        const best = menu.filter(food => species.diet.includes(food.id)).reduce<typeof menu[number] | null>((chosen, food) => {
          return !chosen || (foodYields(food, profile)[limiting] ?? 0) > (foodYields(chosen, profile)[limiting] ?? 0) ? food : chosen;
        }, null);
        advice.textContent = producer ? env.light === 0 ? 'Find light to resume production.' : `Seek dissolved ${limiting === 'nitrogen' ? species.dissolvedUptake?.ammonium ? 'ammonium' : 'nitrate' : limiting === 'phosphorus' ? 'phosphate' : limiting === 'silicon' ? 'silicate' : 'CO₂'} in green patches.` : best ? `Seek ${best.name.toLowerCase()}` : 'Hunt Paramecium · Space to strike';
      } else advice.textContent = producer ? 'Light and dissolved resources sustain you.' : full ? 'Food still replenishes energy.' : 'Your next meal keeps growth going.';
      if (producer && env.light === 0) { status.textContent = cells.length > 1 ? 'Largest cell is in shade' : species.photosynthesis!.darkMassLoss > 0 ? 'Darkness · losing mass' : 'Darkness · production paused'; label.textContent = 'IN SHADE'; }
      else if (producer && player.growthRate > 0) label.textContent = 'PHOTOSYNTHESIS';
      if (starvingCount) { status.textContent = 'Starvation — biomass is shrinking'; label.textContent = 'STARVING'; }
      const mealName = player.lastFoodId?.startsWith('prey:') ? roster[player.lastFoodId.slice(5)].name : player.lastFoodId ? nutrition.foods[player.lastFoodId].name : '';
      digestion.textContent = producer ? inPatch ? 'Gradual uptake · shared patch supply' : 'Outside dissolved nutrient patches' : player.digestion.length ? `Digesting ${player.digestion.length} meals` : mealName ? `Last meal: ${mealName}` : species.diet.length ? 'Touch food to absorb it.' : 'Particles are not in your diet.';
    },
  };
}
