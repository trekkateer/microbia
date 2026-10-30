# microbia - implementation plan

## Scope and game loop

Build Pond Water first with TypeScript, Vite and PixiJS. Start with a local sandbox; add authoritative multiplayer in M7. Players choose an arena, then a fixed species from its roster, explore, eat nutrients and eligible prey, grow, use their species ability, and survive hazards and predators. Arena selection arrives in M5; species selection arrives in M2.

Growth changes size, movement speed and ability strength within species-specific bounds; it never changes species or unlocks interchangeable traits. Each species has one distinctive passive, one Space-triggered active with a cooldown, a biological feeding strategy, and a clear weakness. Abilities span offense, movement, defense, sensing and food production across the roster; every species does not need every category. Balance should reward matchups and positioning without creating a universally strongest species.

## Biology-based species abilities

The game now includes only unicellular organisms. Rotifers have been removed entirely. This scope also excludes the originally proposed multicellular Tardigrades, copepods and nematodes from future arena rosters/NPCs; choose unicellular alternatives when those milestones are designed. Future arena work still requires approval.

Abilities must come from documented structures or behaviors of the chosen organism. Food production means making organic biomass through processes such as photosynthesis; engulfing prey is food acquisition. Nutrient collection, predation and photosynthesis use separate rules, so being larger does not let every species swallow every smaller species.

Keep the original one-passive / one-active control scheme. Ordinary feeding and metabolism do not require extra ability buttons. Cooldowns, size limits, growth rates, stun durations and compressed action times are explicit game balance abstractions, not claims about real biology.

| Pond species | Passive | Active - Space | Feeding strategy and weakness |
| --- | --- | --- | --- |
| **Amoeba proteus** | **Phagocytosis** - can consume a wider range of eligible smaller prey than other hunters. | **Pseudopod engulf** - extend around one nearby, smaller organism and engulf it if capture completes. **Offense / feeding.** | Collect organic nutrients and digest captured prey. Slow movement gives prey an opportunity to escape. |
| **Paramecium** | **Cilia** - agile movement and tight turns. | **Avoidance reaction** - reverse briefly and reorient, with a short defensive trichocyst discharge. **Movement / defense.** | Gather small food particles through its oral feeding apparatus; cannot swallow arbitrary smaller players. Vulnerable to Didinium. Trichocysts help against susceptible predators, not every attacker. |
| **Didinium** | **Specialist hunter** - capture/feeding advantage against Paramecium. | **Toxicyst strike** - a short approach followed by a contact strike that briefly immobilizes eligible prey. **Offense.** | Predation supplies most growth; high upkeep and poor general matchups make missed hunts costly. The short approach and stun timing are gameplay abstractions. |
| **Euglena** | **Photosynthesis** - gradually produces its own biomass in suitable light. | **Phototaxis** - briefly indicate the direction of favorable light and assist turning toward it. **Movement / sensing supporting food production.** | Light-based growth plus species-appropriate nutrient uptake; low defense and a gameplay mass drain in darkness. Dark shrinkage is a balance rule, not a claim that Euglena cannot live heterotrophically. |
| **Diatom** | **Silica frustule** - persistent protection from physical attacks. | **Glide** - a short, deliberate repositioning along the pond substrate. **Movement.** | Photosynthesis produces biomass in light using available nutrients. Very slow movement limits escape and pursuit; cannot engulf organisms. Use a motile pennate species such as **Navicula radiosa**, with its identity fixed before implementation. |

This revises the earlier generic eyespot reveal and three-second invulnerability ideas: an eyespot senses light, and a silica shell provides structural protection. The planned gliding diatom represents a substrate-associated organism within the shared 2D pond, not a freely swimming diatom. Fix the exact Paramecium, Didinium, Euglena and diatom species before implementing their kits and verify species-specific claims; do not assign a trait to an entire genus or group from one example.

### Amoeba engulf rules

- **Temporary first-attacker rule:** one prey cell can be claimed by one hunter at a time across all species, player cells and AI. Targeted strikes reserve prey at activation; untargeted strikes and contact feeding claim it on contact. Ownership follows live attack state and releases on capture, escape, interruption, missed strike or death. Rejected activation spends no energy or cooldown, and another hunter cannot add a stun to claimed prey. AI seeks available alternatives.
- **Engulf presentation:** the ability data opts into pseudopod rendering. A connected membrane silhouette extends two broad, translucent arms with streaming granules, curls around the prey and seals. After authoritative capture, a short-lived visual copy moves into a shrinking food vacuole; escaping prey stays alive while empty arms retract. Use simulation start/end ticks for progress, but keep visual state, geometry and post-capture motion entirely in the client. Apply the same drawing to player, daughter and AI cells; retain organelles and existing collision bodies.

- Passive nutrient collection remains automatic. Capturing another organism is a deliberate **Space** action, using the pseudopod to initiate engulfment.
- The target must be nearly membrane-to-membrane (at most an 8-unit surface gap to start), included in the Amoeba's diet, and strictly smaller. The diet includes smaller rival Amoebae; cells in the player's own group cannot eat each other. Compare simulation mass using a configurable prey-to-predator ratio below 1; the exact ratio is a balance value, not a universal biological limit.
- Target one eligible organism in the steering direction. Start a brief capture interval with a visible wrapping animation; escaping reach or a valid defensive interruption cancels capture. Start cooldown when the action is committed, including an interrupted attempt.
- On successful capture, remove the prey once and transfer a configured fraction of its biological material through a short digestion interval. Digestion releases a nutrient mixture into the predator's reserves; metabolism converts those reserves into biomass. Do not also award the prey's mass as an independent bonus. Keep all gains within the Amoeba's growth cap. Equal-size/larger or otherwise ineligible organisms are never consumed just because sprites overlap.
- M2 implements and tests these rules with controlled prey fixtures. M3 introduces live AI prey, escape behavior and player death/respawn. Do not add AI to M1 retroactively.

## Nutrient diversity and metabolism

Replace the single generic nutrient with a catalog of distinct substances and food materials. Different resources support **energy, biomass construction, ability recovery and specialized structures** in different proportions. A resource's value depends on the species, its current reserves and its surroundings; there is no universally best food or universal conversion of one pickup into one mass point.

### Resource catalog

Plan for approximately **20 resource definitions**, introduced in stages. The entries below are design candidates, not a claim that every species can absorb or use every substance. Enable each species/resource pathway only after checking evidence for that exact species. Arenas select ecologically appropriate subsets; all 20 need not appear in every pond or room.

| Resource definitions | Biological role and planned gameplay contribution |
| --- | --- |
| **Glucose, acetate, glycerol** | Distinct organic carbon sources. Supported metabolic pathways replenish energy and/or carbon reserves with different conversion rates. Predators can obtain carbon through digestion rather than directly absorbing every dissolved source. |
| **Amino acids, peptides** | Supply material for protein synthesis and growth. Adequate reserves support rebuilding protein-based ability machinery, such as defensive or prey-capture structures; the exact recovery bonuses are gameplay abstractions. |
| **Fatty acids, phospholipid-rich material** | Lipid-related supplies for membranes and, where supported, stored metabolic energy. Useful to growing cells and to membrane-intensive feeding, with species-specific digestion requirements. |
| **Nucleotides, phosphate** | Separate organic and inorganic sources that can support phosphorus needs and cellular synthesis through different pathways. Phosphate helps remove a growth bottleneck; it is not itself an energy pickup or an instant ATP refill. |
| **Ammonium, nitrate** | Alternative inorganic nitrogen sources for species with the appropriate assimilation pathways. Support growth and photosynthetic biomass production rather than directly increasing movement speed. |
| **Dissolved carbon dioxide, bicarbonate** | Inorganic carbon sources for supported carbon-fixation pathways. Combined with light and other required nutrients, they supply photosynthetic growth; they do not nourish heterotrophs as if they were sugar. |
| **Dissolved silicate** | Material for constructing diatom silica frustules. Supports shell construction as the diatom grows; cannot be exchanged for an instant invulnerability effect or unlimited armor. |
| **Bioavailable iron, magnesium, sulfate** | Distinct mineral supplies with species-specific metabolic roles. Where supported, sufficient reserves maintain photosynthetic or biosynthetic capacity. Small requirements and capped benefits prevent mineral farming from producing unlimited strength. |
| **Vitamin B1, vitamin B12** | Separate growth factors for species that need or benefit from an external supply. Requirements must be documented per species; neither vitamin acts as a universal speed or damage boost. |
| **Organic detritus** | Digestible particulate material containing a configurable mixture of carbon, nitrogen, phosphorus and lipids. A mixed meal with digestion time, rather than an extra elemental resource counted on top of its contents. |

**Presentation and uptake:** distinguish edible particles from dissolved substances. Particles have a food composition and are collected or engulfed by compatible organisms. Dissolved resources are represented by concentration patches with gradual uptake, not giant molecules that every organism eats on contact. Color and shape distinguish food types, explained by the static Food in this drop guide; no labels float beside particles. Local cues identify dissolved resources. Light is an environmental energy source, not a nutrient pellet. Oxygen availability is a separate environmental condition when an arena needs it.

### How nutrients affect play

- **Growth requires a mixture.** Species-specific conversion rules consume energy and building materials to produce bounded biomass. Excess carbon cannot replace missing nitrogen or phosphorus; the scarcest required input limits the growth rate. Processed reserves stay capped; excess absorbed nutrients remain in the organism's own inventory until used.
- **Absorb on contact.** Every compatible pond food touched by the Amoeba's visible membrane is absorbed immediately, including while reserves are full or other food is digesting. Remove digestion-slot and storage-cap pickup gates. Share the deterministic membrane outline between simulation and rendering and check motion between ticks, so foods do not have to reach the cell's interior. Digestion delays use of nutrients, not their collection.
- **Spawn outside organisms.** Initial placement, starter food and renewal must avoid every living organism's radius, with margin for membrane protrusions and food size. Recheck when a hidden food reappears and when practice organisms reset. Existing food can subsequently be touched through movement.
- **Keep a current inventory per organism.** Track nutrient IDs and quantities separately from processed energy/building-material reserves and pending digestion. Add food constituents once at absorption, consume stock when metabolized, and retain unused stock. Store data-driven usage tags for biomass, energy and reproduction; show current stock rather than cumulative intake. M4.5 division shares each cell's stock, reserves and pending digestion equally with its daughter.
- **Abilities use metabolism.** Keep one active ability and its cooldown. Defined energy costs and material-dependent recovery connect diet to the existing kit: an Amoeba needs energy for engulfment, Paramecium needs recovery resources after defensive discharge, and Didinium must digest suitable prey to sustain repeated strikes. These are bounded game models of biological costs, not literal chemical recipes. Nutrients do not unlock other species' abilities.
- **Movement remains playable.** Energy condition can modestly affect sustained movement or recovery within species bounds. A shortage does not disable basic steering or turn minerals into stackable speed bonuses. Clearly show when an active lacks resources and why.
- **Photosynthesis is conditional.** Euglena and the diatom use light and compatible inorganic carbon sources to build organic reserves; further biomass production also requires nitrogen, phosphorus and other specified inputs. Diatom growth additionally needs silicate for new shell material. Sunlight alone cannot generate unlimited mass.
- **Food chains transfer resources.** Organisms have species-defined body composition and nutrient reserves. Predation transfers only the assimilable fraction, with digestion losses; it never creates both a full biomass reward and a second equivalent resource reward. Didinium gets its nutrition chiefly through prey rather than grazing every resource type.
- **Balance is species-specific.** Cap reserves, conversion efficiency, recovery benefits and ability strength. Model nutrient shortage first; toxicity or overdose systems are outside this revision. Arena spawn/renewal settings provide viable feeding routes and prevent unavoidable starvation at spawn.
- **Keep choices readable.** Show biomass, usable energy and the most relevant current shortage or recovery need. Use the static **Food in this drop** guide, without labels floating next to food. Add an expandable **Absorbed nutrients** inventory on the organism card. Avoid a permanent dashboard of 20 meters or manual crafting. Explain each nutrient's real role and its simplified game effect in the Microdex.

The foundation is implemented in **M1.5**: four organic food types, five constituent nutrient definitions, capped energy/building-material reserves, delayed digestion and nutrient-limited growth. Connect it to abilities in M2, food chains in M3 and photosynthesis/mineral uptake in M4; the wider catalog remains staged.

## Architecture and data model

- **Simulation:** pure TypeScript with no PixiJS, browser, clock or DOM dependencies. Run fixed 30 Hz steps using an accumulator; render interpolated snapshots independently. Inputs are commands, randomness is seeded, and simulation ticks own cooldowns, movement, feeding, combat, zones, death and respawn. This core can later run on a Node.js server.
- **Rendering:** PixiJS reads snapshots and events to draw organisms, food, zones and effects. Camera following and automatic growth-based zoom are presentation concerns; there are no manual field-of-view controls. Membrane pose/geometry is simulation-owned and shared with rendering so contact matches the visible outline. Optical glows and consumption pulses remain decorative.
- **Definitions:** typed, immutable data with stable IDs; validate references and required fields when loading. Runtime state stores mass, position, velocity, health, status effects, cooldowns, resource reserves and pending digestion separately from definitions.
- **Arena:** ID, name, species roster, NPC types, zone/hazard definitions and placement, map dimensions, resource palette, food/patch abundance, concentration, distribution and renewal settings, theme/background/music references, maximum players and fact-card ID. M1 introduced the base schema; M1.5 replaces its single nutrient setting with resource definitions.
- **Nutrients and food:** separate resource identity from food composition. Resource records hold biological form, role tags, icon/color, storage units, source references and fact-card ID. Food records reference constituent resources and quantities; dissolved patches reference a resource, concentration, area and renewal rate. Quantities use documented game units, not asserted laboratory concentrations.
- **Species:** ID, scientific/display names, visual reference, base stats, bounded growth curves, diet/prey filters, nutrition modes (particle feeding, predation, photosynthesis or dissolved nutrient uptake), compatible resource IDs, uptake/assimilation rates, reserve limits, growth requirements, body composition, upkeep, engulf limits, passive ID, active ID, weakness, AI profile and fact-card ID. Reuse species definitions across arenas.
- **Abilities and counters:** ability records hold role tags, biological mechanism/source references, effect IDs, activation conditions, targeting, range, capture/digestion duration, assimilation efficiency, energy/material costs, recovery requirements, bounded nutrient-dependent modifiers, strength, interruption rules and cooldown where applicable. Photosynthesis records specify light/nutrient requirements and production rate. Directed matchup records define attacker/target modifiers; species files do not contain opponent-specific branches. Validate resource references, finite nonnegative quantities, effect IDs and nutrition modes against registered handlers.
- **Hazards and NPCs:** reusable behavior/effect IDs plus parameters, collision shapes, timing and spawn rules. NPCs have separate definitions and cannot be selected as player species.
- **Fact cards:** stable IDs, title, short explanation and source references, linked to species and arenas. Separate real biology from gameplay abstractions; verify scientific claims before publishing cards. Collection UI and persistence arrive in M6.

## Mechanics

- **Movement and feeding:** commands express a desired direction and ability activation; the simulation applies species speed and turning limits. Diet, target size, defenses and capture state determine prey eligibility. Each feeding mode has its own rules; sharing a mass stat does not give photosynthetic species predatory abilities. Damage and stun are separate effects where needed.
- **Solid bodies:** use convex envelopes of the shared membrane geometry for organism collisions, including rotation, stretch and growth. Subdivide movement and knockback to prevent tunneling; record the resolved path for rendering. Bodies separate and slide around one another. Capture removes prey only when feeding succeeds; ordinary overlap never lets a cell pass through another. World boundaries contain the whole membrane.
- **Metabolism:** fixed simulation steps resolve ingestion/uptake, digestion, reserve conversion, upkeep, ability resource checks and growth in a documented order. Debit food/patch quantities when taking them, release digestion yields once, and consume required reserves when creating biomass or activating an ability. A failed activation must not partially debit resources. Clients render resource state; they never compute authoritative growth. Use seeded resource placement and deterministic renewal so this transfers to the server unchanged.
- **Abilities:** a shared effect-handler registry interprets data records for capture/engulf/digest, reversal, defensive discharge, contact strike, stun, light sensing, photosynthesis and gliding. Check cooldown, target validity and capture completion on the simulation side; rendering only depicts the result. New species using existing effects need data and art; genuinely new mechanics require reusable handlers.
- **Counters and weaknesses:** tune directional matchup modifiers alongside mobility, diet, defense and mass upkeep. Didinium specializes against Paramecium and loses mass without feeding; Amoeba can engulf relatively larger eligible prey but still only targets smaller organisms. Diatoms remain very slow, defensive producers. Size alone must not override diet restrictions or the Amoeba's strict smaller-prey condition. Keep all balance values in data.
- **Zones and hazards:** simulation systems query zone membership and apply configured light/nutrient-dependent production, dark mass changes, current forces or timed effects. Photosynthesis creates organic reserves that metabolism can turn into bounded biomass; it does not spawn edible pellets or directly feed other players. Rendering consumes the same definitions for visible boundaries and feedback. Species interactions are configured through effect parameters.
- **AI:** produce the same movement/ability commands as players. Use data-defined priorities for wandering, seeking compatible food that addresses current shortages, fleeing counters and hunting eligible prey. AI obeys the same resource costs and uptake limits as players. Only unicellular organisms belong in the game; future NPC definitions must respect this scope.

## Folder structure

```text
src/
  data/
    schemas.ts
    arenas/pond.ts                 # gut.ts added in M5
    species/amoeba.ts              # one definition per species
    nutrients/  foods/             # resource identities and composite food definitions
    metabolism/                   # reusable conversion and requirement profiles
    abilities/  counters/  hazards/  npcs/  facts/
  sim/
    world.ts  step.ts  commands.ts  types.ts
    systems/                      # movement, feeding, metabolism, combat, abilities, zones, AI
    effects/                      # reusable effect handlers
  client/
    main.ts  input/  rendering/  camera/  ui/  audio/
  shared/                         # snapshot and network contracts
public/assets/                    # organism art, arena art, audio
tests/                            # simulation and definition validation
server/                           # added in M7; imports shared simulation
```

## Milestones and acceptance checks

| Milestone | Deliverable | How to verify |
| --- | --- | --- |
| **M1 - Amoeba sandbox** | Vite/PixiJS setup; Pond Water definition; one Amoeba; movement, nutrients, eating, bounded growth, following camera and zoom. | Move around the map, consume nutrients, confirm mass/size changes and camera behavior. Check fixed-step feeding and growth with a seeded simulation. |
| **M1.5 - Nutrient foundation** | Resource/food/metabolism schemas; replace generic pellets with several visually distinct, Amoeba-compatible food compositions, including carbon-rich, protein-rich, lipid-rich and mixed detrital material. Add capped reserves, energy and growth requirements, digestion and minimal nutrient feedback. Enable the wider catalog as relevant species arrive. | Different meals must produce different reserve/growth outcomes. Check growth bottlenecks, reserve caps, unsupported uptake, nonnegative resources, single digestion yields, deterministic renewal and readable food distinctions. |
| **M2 - Species and abilities** | Data-driven selection and roster; Amoeba engulf/digestion, Paramecium avoidance/discharge, Didinium contact strike, distinct diets, passives, weaknesses and cooldown UI. Fixed cooldowns plus energy/material availability connect recovery to diet. | Select each species; exercise Space, cooldown and resource gating. Use controlled prey fixtures to check smaller-prey limits, escape/interruption, diet restrictions, nutrient transfer without duplicate biomass rewards, and shortage effects on abilities. |
| **M3 - Pond AI and survival** | AI organisms for all five pond species; death and respawn. Nutrient-aware foraging and prey composition connect the food chain. Euglena and Diatom get definitions, visuals and basic AI here; their full mechanics and player selection arrive in M4. | Observe resource-aware feeding, fleeing and hunting; use Amoeba engulf against live smaller AI prey. Verify ability-aware escapes, predator feeding, assimilation losses and reset of reserves/capture/digestion on death/respawn. |
| **M4 - Complete Pond Water** | Playable Euglena and Diatom with photosynthetic food production, phototaxis, silica defense and gliding; light/dark zones, cold currents and appropriate dissolved nutrient patches. Complete each pond species' verified resource profile. | Check light/carbon/nitrogen/phosphorus limitations, bounded production, silicate-dependent diatom construction, species-specific uptake, dark mass loss, light sensing, shell defense, gliding and currents. Producers must not engulf other organisms. |
| **M4.5 - Reproduction before new arenas** | R divides ready cells into two player-controlled daughters; species-specific mass thresholds, conserved nutrient inventories/reserves/digestion, group steering and camera, Amoeba targets nearby forward prey; Didinium retains cursor aiming. AI also divides using the same rules. | Check thresholds, exact resource conservation, cooldown inheritance, crowded and corner division, no free respawn of offspring, uncapped population growth, continued survival after losing one cell, shared steering and intended-target attacks. |
| **M5 - Arena system** | Arena selection and room lifecycle; add Human Gut with its requested roster, resource palette, metabolic profiles, antibiotic waves, bile surges and macrophage NPCs. Define its species kits before implementation at this milestone. | Switch arenas and confirm independent rosters, food distributions, maps, NPCs, hazards and themes. Reuse existing handlers where possible; extend them for new gut mechanics. Live player counts wait for M7. |
| **M6 - Microdex and polish** | Collectible species/arena fact cards, nutrient explanations, Microdex, sound/music, menus, microscope visuals and mobile touch movement/ability controls. | Check card collection and persistence, sourced explanations of nutrient roles versus gameplay effects, readable shortage feedback, audio controls, and equivalent mouse/touch actions. |
| **M7 - Multiplayer** | Node.js authoritative server using Colyseus or ws, selected at this milestone; arena-configured room types for roughly 20 players, live lobby counts, per-arena leaderboard and species balance stats. | Run multiple clients and a 20-player load scenario; verify authoritative nutrient uptake/metabolism, no duplicate food consumption, resource/cooldown enforcement, room isolation, joins/disconnects, synchronized state and lobby/leaderboard updates. |

## Working agreement

M3 and the collision fix were approved and are implemented. Solid membrane bodies now block ordinary movement, lunges and knockback. The live pond starts with 22 AI organisms: three Amoebae, six Paramecium, three Didinium, five Euglena gracilis and five Navicula radiosa. AI commands use the same simulation systems as player input. Profiles configure foraging, hunting, fleeing and wandering; all organisms own their nutrient inventories.

Predation causes death; Didinium also dies after 30 seconds with depleted energy. Players can respawn after three seconds, with the same species and clean reserves/cooldowns. AI repopulates after seven seconds. Respawns use clear positions and three seconds of protection, which also prevents attacks by the new organism. Food placement continues to exclude every living organism, including renewal and organism respawns. Nutrition and ability numbers are game abstractions; source-backed facts distinguish them from biology.

M4 is approved and implemented: all five pond species are playable. Euglena uses photosynthesis and phototaxis; Navicula radiosa uses photosynthesis, silica protection and a short substrate glide. Light, shade and cold-current circles live in the arena data. Current drift passes through the existing solid-body solver. Dissolved patches have finite shared resource stocks and capped renewal; supported species absorb gradually, with storage and uptake caps.

Euglena uses CO2, ammonium and phosphate; Diatom uses CO2, nitrate, phosphate and silicate. Light converts absorbed CO2 into carbohydrate; metabolism then supplies energy, carbon and lipid synthesis. Nitrogen, phosphorus and (for Diatom) silicon separately constrain biomass. Production, growth and reserves are bounded. Dark shrinkage applies only to Euglena; its real heterotrophic pathways are not implemented. Trace minerals and vitamins are assumed available in this reduced model. Diatom growth consumes silicate, while existing shell protection remains when silicate is scarce. With no general hit-point system, defense reduces prey eligibility, extends capture duration and reduces stun/push. Those values are game abstractions, not species-specific measurements.

Producer AI seeks sunlit nutrient patches, flees predators and uses its normal kit. Producer spawning/respawning first tries clear, lit patches so slow organisms can feed. Zone shading, current arrows, phototaxis direction, gliding trails, species-specific food guidance and environment status expose the mechanics. See `README.md` for run and test instructions.

M4.5 is authorized before other arenas. Press R to divide all ready player cells; the user explicitly chose to keep offspring player-controlled, as in agar.io. Paramecium, Euglena and Diatom divide at 30% of maximum mass (60, 48 and 48 respectively); Amoeba/Didinium retain their 95% cutoff. These are initial game balance values in species data, not biological measurements. Both daughters receive half the actual mass, raw nutrient stocks, processed reserves and each pending meal, preserving its digestion deadline. No fresh energy, cooldown reset, protection, or duplicate biomass reward is created. Division is blocked while stunned, protected, using an ability, or being captured. Crowding does not prevent division: prefer an open orientation, otherwise separate daughters inside the old membrane and use solid-body collision resolution to make room and respect map boundaries. Each daughter must meet the same mass threshold to divide again; no extra chemical recipe is added.

All player cells share keyboard steering; mouse steering sends each toward the same world point. The camera follows their center and fits their spread automatically. The HUD totals biomass and nutrient stock across the group and shows how many cells can divide. For Amoeba Space attacks, select the closest eligible prey in the swimming-direction cone of a ready owned cell, ignoring pointer position. At rest use the last heading. Didinium retains cursor selection (or a forward cone for keyboard aim), then chooses the closest eligible cell with an available ability. That cell alone pays/attacks; the selected prey stays locked for that attempt. Movement/sensing/defense actives apply to ready cells individually. Losing one player cell does not end the round; after the last one dies, normal single-cell respawn applies.

AI cells divide automatically at their own threshold when not fleeing, using the same conservation and collision resolution. There is no organism-count cap; growth depends on available nutrients and each species' reproduction threshold. Extra offspring are removed permanently on death; they do not create permanent respawn slots. Offspring IDs are deterministic and their rendering objects are cleaned up. This is an equal-biomass gameplay model, not a detailed simulation of species-specific cell cycles. Stop after reproduction; M5 still awaits approval.

M3 verification: 52 simulation tests and eight browser checks cover collisions, live AI, all existing kits, nutrient handling, death, respawn and spawning. Gameplay and death-screen screenshots were inspected at desktop and compact sizes.

M4 verification: 71 simulation tests and 11 browser checks pass, as does the TypeScript/Vite production build. Screenshots of the new species, phototaxis, gliding, shade and currents were inspected. Compact layout assertions verify that the food guide and growth panel do not overlap and environment status stays above the organism card. The food guide and organism card scroll in short windows.

M4.5 verification: all 90 simulation tests and 14 browser checks pass, along with the TypeScript/Vite production build. Browser checks exercise R division, control of both daughters, cursor-selected attacks by the closest eligible hunter, survival after losing one cell and single-cell respawn after losing the group. Desktop and compact reproduction screenshots and the updated selection screen were inspected.

Reproduction follow-up verification: 93 simulation/render-state tests, 15 browser checks and the production build pass. Crowded/corner division succeeds with conserved mass and separated bodies. Resource absorption pulses track each controlled cell independently, including dissolved uptake and survivor promotion, and reset on respawn. Screenshots confirm the pulse on each daughter. Rotifer definitions, spawning, mechanics, visuals and interface references have been removed; the pond starts with 22 single-celled AI organisms.

Engulf/balance follow-up verification: 106 simulation/render-state tests, 17 browser checks and the production build pass. Coverage includes the first accepted attack across captures, strikes and contact feeding; claim release; close membrane activation without charging failed attempts; Amoeba cannibalism with protection for controlled siblings; 70% reproduction for non-predators; and animation lifecycle/geometry. Browser screenshots were inspected for reaching, wrapping, sealing, rotated targets, swallowing and escape. The final animation smoothing and ownership browser checks were rerun after visual refinement.

Latest balance adjustment: non-predators now divide at 30% of maximum biomass. Amoeba prey must be strictly below 70% of the attacking cell's mass, including rival Amoebae; equal-to-limit prey is ineligible. Diatom shell defense further limits eligibility. These rules apply to player and AI cells through the shared simulation. Verification: 110 simulation/render-state tests, 17 browser checks and the production build pass, including strict prey-size boundaries and conservation of daughter biomass at the lower division thresholds.

AI colony/performance follow-up: offspring inherit a persistent colony ID across generations. One surviving member supplies shared decisions; all members follow the destination with cohesion and speed matching, while nutrition, division and abilities remain per cell. Related predators cannot eat or knock back each other. The closest eligible colony member attacks shared prey. Founder respawn waits until no relatives remain alive. The simulation stays independent of rendering.

Engine optimization retains detailed collision geometry with linear support-vertex projection and cached pair intervals during positional resolution. Food selection uses one scored scan per decision. Rendering shares immutable vector interiors, culls off-screen cells, and avoids duplicate HUD updates. A repeatable browser stress test measures 32 and 64 cells with the normal food population. The local 64-cell median simulation step fell from 87.7 ms to 13.1 ms (95th percentile: 230.1 to 16.2 ms); render preparation fell from 5.2 to 2.8 ms. No population cap reduction or simulation-rate change is used to obtain the improvement.

Colony/performance verification: 116 simulation/render-state tests and the production build pass. All 20 browser checks passed across the full run and targeted reruns after correcting two browser fixtures. Coverage includes multi-generation membership, cohesion with unequal speeds, parent loss, colony hunting, deterministic replay, exhaustive-reference collision comparisons, off-screen culling, and shared-interior lifetime. AI colony, crowded pond and engulf screenshots were inspected; organelles remain visible.

Latest authorized pond follow-up: remove all reproduction population caps, expand the map to 4800 x 3600 (1.5x each dimension), and scale zone/patch placement and radii. Preserve finite resource supply and the existing fractional prey transfer (Amoeba 65%, Didinium 75%), with regression coverage for loss and no double-counting of digestion. Collision broad-phase now sweeps nearby bounds, rebuilding after positional corrections, to support growing populations without all-pairs scans.

Emergency AI fleeing checks for threats between ordinary decisions, including threats to colony daughters. Escape cancels ongoing phototaxis and overrides regrouping; wall tangents avoid steering back into predators. Amoeba selects nearest eligible forward prey by each owned cell's actual swimming heading, never cursor coordinates or collision-induced velocity. Didinium aiming remains unchanged. Other abilities use data-selected visual styles with timed darts, wakes, toxicyst capture filaments, eyespot waves and raphe/glide trails, bounded history, fading completion and death/respawn cleanup. No new arena milestone is started.

Pond follow-up verification: 129 simulation/render-state tests and the production build pass. All 24 browser checks passed; the 11 collision, feeding, colony, reproduction and stress checks passed again after the final engine optimization. Ability screenshots were inspected across all four species. Collision geometry is cached across movement substeps within a tick, with invalidation on growth/rotation/stretch; redundant collision resolution is removed. Food contact first rejects distant particles using motion bounds and squared distances, retaining the exact membrane sweep. The latest 32/64/128-cell median simulation steps measured 3.4/9.3/25.0 ms (95th percentile 5.8/13.1/30.6 ms). The dense 128-cell live scene still measured a 91.4 ms median frame interval, so uncapped populations are supported but arbitrary population sizes are not yet guaranteed smooth.

October 27 authorized performance pass: preserve uncapped populations, detailed membrane contact and the 30 Hz simulation. Cache normalized membrane/hull templates with bounded storage, transform their projections per cell, use tight hull bounds for the collision sweep, stop separated pairs early and check their last contact normal first. Revalidate cached partial projections when cells move back together. Index particle food spatially without changing pickup ordering or swept contact. Rebuild ordinary neighboring membrane/cilia graphics once per simulation tick while continuing position/rotation interpolation and full-frame engulf/ability animation.

Performance verification: 132 unit tests, all 25 browser checks and the production build pass. Added independent world-space hull comparisons, same-tick separation-to-contact cache regression, source-ordered spatial query checks and browser verification that cached drawings still interpolate. Crowded pond, engulfing and ability screenshots were inspected. With CPU profiling enabled on both runs, local 32/64/128-cell median simulation cost fell from 3.6/10.8/29.0 ms to 1.9/4.6/11.2 ms. At 128 cells the 95th percentile fell from 34.2 to 15.2 ms; live median frame interval fell from 163.7 to 42.6 ms (95th percentile 242.4 to 59.6 ms). This stress scene still does not sustain 60 fps, and no arbitrary-population guarantee is claimed. Stop here; M5 and Didinium balance remain separate work.

### Deferred balance work

The user flagged Didinium as an unattractive choice in its current state. Give it a dedicated future buff/balance pass while preserving prey-based nutrition; evaluate hunting reliability, successful-hunt rewards and upkeep. No Didinium buffs are included in M4. This is an acknowledged balance need, not an approved extra milestone.

Build one milestone at a time; at each handoff provide the exact run commands, manual checks, automated checks and their results, then stop for approval. Keep suggested additions separate from implementation scope.

## Biology references for ability and nutrient design

- Amoeboid engulfment and pseudopodia: [The Cell - Endocytosis, NCBI Bookshelf](https://www.ncbi.nlm.nih.gov/books/NBK9831/).
- Paramecium avoidance movement: [Electrophysiological and kinematic model, 2023](https://pmc.ncbi.nlm.nih.gov/articles/PMC9946239/). Predator-dependent trichocyst defense: [Experimental study, 1996](https://www.sciencedirect.com/science/article/pii/S0932473996800484).
- Didinium prey capture and toxicysts: [Ciliate trophic ecology review, 2014](https://academic.oup.com/femsec/article/90/1/18/2680478).
- Euglena light sensing and photosynthetic orientation: [Eyespot formation and phototaxis study, 2023](https://pmc.ncbi.nlm.nih.gov/articles/PMC10069888/).
- Diatom mechanical protection: [Frustule strength study, 2003](https://pubmed.ncbi.nlm.nih.gov/12594512/). Motile, benthic diatom candidate: [Navicula radiosa - Diatoms of North America](https://diatoms.org/species/45847/navicula_radiosa).
- General distinction between energy, carbon and nutrient requirements: [OpenStax - Prokaryotic Metabolism](https://openstax.org/books/biology-2e/pages/22-3-prokaryotic-metabolism). This is general background, not evidence that a particular pond protist uses a particular substrate.
- Species-specific nutritional requirements: [OpenStax - Media Used for Bacterial Growth](https://openstax.org/books/microbiology/pages/9-6-media-used-for-bacterial-growth). Exact uptake and vitamin requirements still need species-specific verification before implementation.
- Diatom carbon, nitrogen, phosphorus and silicon allocation: [Modeling elemental stoichiometry and silicon accumulation, 2022](https://pmc.ncbi.nlm.nih.gov/articles/PMC9743000/).
- M4 Euglena photosynthetic and heterotrophic growth: [Culture study](https://pmc.ncbi.nlm.nih.gov/articles/PMC5896972/). Ammonium use: [Nitrogen-limitation experiment](https://pmc.ncbi.nlm.nih.gov/articles/PMC6448558/).
- M4 Navicula radiosa medium and illumination: [CCAP strain record](https://www.ccap.ac.uk/catalogue/strain-1050-12). Nitrate/phosphate/silicate in Chu medium: [ATCC recipe](https://www.atcc.org/~/media/4368612a40a648c2ab230cb4c642202e.ashx). The resource model is a reduced interpretation of culture requirements, not measured field uptake rates.

## October 28: authorized priority change - Didinium then M7 prototype

The user authorized the deferred Didinium balance pass and explicitly deferred M5/M6 to prioritize a working multiplayer prototype. This supersedes the earlier stop-before-M5/Didinium restrictions for this work.

Implemented a focused Didinium balance pass: starting/minimum speed 190/120, contact capture 1.8s, strike cooldown 3s, cost 4 energy, duration 0.36s, speed 400 and hold range 35. Upkeep is 0.65/s plus 0.3/s movement. Preserve the specialist diet, prey limits, 75% transfer and 95% reproduction threshold; verify these initial values through human playtesting.

M7 prototype: authoritative Node server, named isolated Pond Water rooms (20 players each), validated owner-bound commands, owner-aware colony/targeting/collision rules, division and respawn, disconnect cleanup, lobby counts and live biomass leaderboards. The server uses the existing 30 Hz simulation and streams full snapshots at 10 Hz. HTTP POST/SSE uses built-in Node modules because the package registry was unreachable; WebSocket transport is deferred. Build and run instructions are in README.md. M5/M6 remain deferred.

Validation: 136 simulation tests and both production builds pass. A two-browser integration test is added. Browser/network execution is blocked by sandbox loopback EACCES, so real multi-client/browser load validation remains pending. No public deployment or competitive-balance claim is made. Persistent species balance statistics, efficient delta snapshots, prediction and reconnect recovery remain future M7 work.


## Multiplayer latency follow-up

User reported rapid Paramecium reproduction overwhelming the server. Preserve current reproduction thresholds and uncapped population growth; improve engine and network costs first. Implemented batched division collision resolution, broad-phase reproduction corridor rejection, per-species AI threat candidates, eliminated-owner death-record cleanup, once-per-room compact render encoding with private owned-cell state and incremental food updates, congestion resynchronization, 15 Hz snapshots with inter-snapshot motion paths, and up to four concurrent sequence-checked HTTP input requests. Delayed unique button actions are retained without rewinding newer movement.

Controlled 256-cell measurements: synchronized division tick about 296ms before versus 46ms after; 20-client broadcast preparation roughly 24-31ms before versus 1-2ms after; recurring total payload 7.19MB versus 0.98MB (86% reduction per broadcast). A 256-to-512 Paramecium AI stress scene measured approximately 14ms median / 24ms p95 steady simulation ticks. These are local component timings, not measured internet latency or an unlimited-population guarantee. Client and server require rebuild/restart and browser reload together due to the updated packet/input format. Browser transport testing remains blocked by loopback EACCES.


## Hunger and starvation follow-up

User authorized a hunger bar and ongoing food/resource demand to limit population growth naturally. Implemented per-cell normalized satiety, separate from energy, with 45s shortage depletion and 12s supplied recovery. Processed energy plus small carbon/nitrogen/phosphorus/lipid upkeep is paid before growth and scales with biomass. Balanced digestion or photosynthesis/dissolved uptake sustains cells; incompatible pickups and carbon-only diets cannot refill missing reserves. At zero satiety, biomass drains (max of species base loss, 0.35/s and 1.5% current mass/s); 30 accumulated empty-bar seconds cause Starvation death in lifecycle-enabled ponds. Recovery to 25% clears accumulated starvation. Lower mass floors allow visible shrinkage for non-hunters; floors do not grant immortality. Existing non-lifecycle sandbox fixtures retain floor clamping.

The HUD displays the least-fed owned cell and starving-cell counts. Low hunger (<=25%) blocks division; ordinary species mass thresholds and uncapped populations remain. Division inherits satiety and hungry ticks with conserved stocks; respawn resets nourishment. Compact multiplayer state carries satiety, while input never accepts client nutrition changes. All 151 simulation tests pass. A hunger HUD browser check is added; local sockets remain blocked by EACCES in this environment.

## Public hosting preparation

Live latency follow-up: replace per-input HTTP requests with a persistent
WebSocket using ws, while retaining POST/SSE for old clients and blocked upgrades.
Both transports share room simulation, compact encoding and congestion recovery.
Added native ping/pong liveness, bounded payloads and input buffering, plus a fresh
fallback session to avoid cleanup races. The client displays transport, RTT,
server tick rate/step cost and render FPS. Added real socket integration coverage
and mocked-client tests for WebSocket input, queued actions and fallback. Keep
free hosting unchanged; future sizing should follow live measurements.

Division presentation follow-up: added a 1.2-second client animation that observes
authoritative births, grows the daughter membrane and organelles, eases both cells
apart and pinches off a membrane neck. Death and generation changes cancel the
visual. Existing colonies do not replay births on join. Added parent IDs to compact
public actor packets so rival and AI divisions animate as well as owned divisions.
Simulation timing, resource conservation and collision rules are unchanged.

Added `render.yaml` for a single Node web service serving both the built client and
authoritative simulation, pinned Node 26.10.0, production dependency installation
including build tools, `/healthz`, and SIGTERM/SIGINT shutdown handling. SSE responses
disable proxy transformations. Free compute is the initial connectivity-test default;
paid sizing and region should be selected after real multiplayer measurements.
README documents deployment, two-device verification, custom-domain setup and the
single-instance/in-memory restart limitations.

Validation: 151 tests pass with TEMP/TMP pointed at the workspace `.test-temp`
directory; both production builds pass. The built server starts, but a local HTTP
health probe fails with EACCES. Public deployment is not yet performed: there is
no configured Git remote, local GitHub authentication is invalid, and Render/GitHub
connections have been offered but not confirmed. No domain records or paid resources
have been changed.

## Paramecium discharge follow-up

User requested outward knockback instead of self-reversal. Paramecium now uses a discharge effect that preserves ordinary steering and heading, pushes nearby rival cells radially once, excludes allies and retains species defenses and capture interruption. Costs, range, duration and cooldown are unchanged. All 155 tests and both production builds pass.


Latency verification: 157 unit tests, both production builds, and the real local WebSocket/HTTP transport integration check pass. Deployed commit 763f08f. A 35-snapshot probe through www.microbia.us measured median acknowledgment RTT 29ms, median snapshot gap 67ms, maximum gap 164ms and effective simulation rate 29Hz; the sampled server step was 2.36ms. These are brief measurements from this environment through its configured proxy, not a guarantee for every player or crowded pond. Paid hosting remains unchanged.

