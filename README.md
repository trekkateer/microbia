# microbia.gg

**M4 + reproduction are implemented:** all five Pond Water species are playable. Grow, press R to divide, and control both daughters together. Amoeba attacks nearby prey along its swimming direction; Didinium retains pointer aiming. Photosynthesis, environmental zones, single-celled AI, solid collisions and death/respawn remain active. An M7 multiplayer prototype is now available; see the multiplayer instructions below. See [PLAN.md](PLAN.md).

## Run

### Multiplayer connection diagnostics

Multiplayer now prefers one WebSocket at `/api/socket` for state and input,
avoiding a separate HTTP request for every steering update. HTTP POST/SSE remains
available if a WebSocket upgrade is blocked. Both paths authenticate sessions,
use sequence-checked server-authoritative commands and resynchronize food after
congestion. Server pings remove abandoned socket connections.

The online status shows transport, input round-trip time (RTT), server simulation
frequency and step time, plus client FPS. Low server Hz indicates simulation
slowdown; high RTT indicates connection delay; low FPS indicates client rendering
cost. These measurements describe different parts of the experience and are not
an input-to-screen latency measurement. Render free compute remains a prototype
hosting tier; changing the domain does not increase compute capacity.

Run `npm run test:transport` for a live local-server check of WebSocket movement,
authentication, disconnect cleanup and SSE compatibility. This requires local
loopback connections. Custom domains use the same-origin secure WebSocket URL;
the Vite development proxy forwards WebSocket upgrades too.

### Public hosting (Render)

The root `render.yaml` deploys the frontend and authoritative Node server together.
It starts with free compute for an initial connectivity test; choose paid compute
before evaluating latency or sustained multiplayer load. Free instances sleep on
idle and are not a performance target.

1. Push this project to a GitHub repository and connect that repository to Render.
2. In Render, create a **Blueprint** from the repository and review `render.yaml`.
3. Deploy, then open the service's HTTPS `onrender.com` address. No separate API
   URL or CORS configuration is needed. Render supplies `PORT` and terminates TLS.
4. Check `/healthz` returns `200` with `{"status":"ok"}`. On two devices, enable
   **Multiplayer prototype**, join the same room, and verify movement, division,
   hunger, leaderboard updates and disconnect cleanup.
5. Watch CPU, memory and outbound bandwidth while testing. Choose a region near
   the players (the initial configuration uses Ohio).

Keep exactly **one instance**: rooms and sessions live in process memory and
cannot be spread across replicas. Deploys/restarts reset every pond and disconnect
players; reload and rejoin afterward. No database or disk is required yet.
The server closes live streams on SIGTERM/SIGINT and exposes `/healthz` for host
readiness checks. The build explicitly installs development dependencies because
TypeScript and Vite are required even when `NODE_ENV=production`.

For a custom domain, first verify the generated URL, then add `microbia.gg` in
Render's custom-domain settings and apply the DNS records Render provides. Do not
change DNS until domain ownership and the current records have been checked.

Hosting references: https://render.com/docs/blueprint-spec,
https://render.com/docs/free, https://render.com/docs/custom-domains.

Tested with Node.js 26.10.0 and npm 12.1.0.

```sh
npm ci
npm run dev
```

Open the address printed by Vite, normally http://127.0.0.1:5173. If that port is occupied, Vite uses the next free one. Keep the terminal running; Ctrl+C stops it. This milestone targets desktop mouse/keyboard with WebGL; touch controls arrive in M6.

## Play and check M4

Choose a species. Steer your cells with the mouse, WASD or arrow keys. Mouse steering guides every cell toward the cursor's world position; keyboard input moves them together and clears mouse steering. Press **Space** for your species ability and **R** to divide ready cells. The camera follows the group and adjusts automatically.

### Reproduction

Switching tabs keeps the pond running. Multiplayer continues on the server;
local play transfers simulation to a worker while hidden and resumes from that
state when you return. Controls reset on switching away, and hidden tabs skip
rendering. Browser tab suspension/discard or putting the computer to sleep can
still suspend local play; multiplayer keeps running while the server is available.

Division now has a 1.2-second membrane animation: a daughter forms gradually,
the cells ease apart, and the connecting neck narrows and separates. Organelles
scale with each cell. The visual runs for players and AI in local and multiplayer
ponds; authoritative biomass, nutrition and collisions still split immediately.

| Species | Minimum fraction of maximum biomass | Mass needed per cell |
| --- | --- | --- |
| Euglena | 30% | 48 |
| Diatom | 30% | 48 |
| Paramecium | 30% | 60 |
| Amoeba | 95% | 213.75 |
| Didinium | 95% | 190 |

Press **R**, or click **Divide**, once the panel says Ready. Each ready cell becomes two cells of the same species, both under your control. Biomass, unused nutrient stock, energy/building reserves and digesting food are split 50/50. Digestion deadlines and active cooldowns carry over. The total biomass display stays the same at division; each individual cell is smaller and can divide again only if it meets the same mass threshold. Thresholds are tunable game balance values, with higher cutoffs for hunters.

For Amoeba, swim toward nearby prey and press Space: the closest eligible prey in front of a ready cell is selected. Pointer position does not select prey. At rest, the last swimming direction is used; collision pushes do not change aim. Didinium retains pointer targeting and keyboard forward aiming. Diet, size, range and resource rules still apply. Other species' movement/sensing/defense abilities apply to their ready cells, each paying its own cost. All cells continue to show organelles. Every controlled cell has its own resource absorption pulse, including particle feeding, prey ingestion and dissolved uptake.

AI daughters also stay in colonies. They share a destination, regroup when separated, and adjust their pace to stay together. Each cell keeps its own biomass, nutrients and abilities. Predator colonies choose the closest eligible cell for a shared prey target and cannot eat or push their own relatives. Surviving daughters continue together after the founder dies; its replacement spawns only once the colony is gone.

Escape takes priority over light-seeking and regrouping. A threatened Euglena cancels active phototaxis without refunding its cost/cooldown. Any daughter can alert the colony; members flee away from the predator, using a tangent at walls rather than turning back into danger.

Predation loses nutrients: Amoeba transfers 65% (35% loss), Didinium 75% (25% loss). These existing data-driven fractions apply once to prey body nutrients and unused stock, including undigested food; the pending meal record is not counted twice. Consumed prey does not grant its full mass or duplicate its processed reserves. Food supply and predation losses constrain growth, rather than a cell-count ceiling.

The other four abilities now have animated effects: Paramecium releases staggered trichocyst darts and expanding ripples; Didinium leaves a lunge wake and pulses toxicyst filaments into stunned prey; Euglena's eyespot glows with scanning light waves; Diatom has moving raphe particles and a fading glide trail. Effects follow ability timing, fade after completion, and apply to player and AI cells without hiding organelles or changing hitboxes.

### Crowded pond performance

The performance pass preserves the detailed membrane hulls, 30 Hz simulation, uncapped population and feeding rules. Collision checks use tight shape bounds, shared shape templates, cached self-projections, early separating-axis rejection and the last contact normal. A spatial grid restricts nutrient pickup to nearby food while preserving source order and exact swept contact. All geometry caches are bounded or tick-local.

Rendering reuses organelles and membrane templates and skips off-screen cells. Ordinary neighboring membranes/cilia rebuild at the simulation cadence; position and rotation still interpolate every frame. Engulfing and ability effects retain frame-by-frame animation.

October 27 local before/after samples used the same browser stress test and CPU profiling on both runs: 950 food particles, with 32/64/128 living AI/player cells protected from death to hold population constant. Times are milliseconds per simulation update:

| Cells | Median before / after | 95th percentile before / after |
| --- | --- | --- |
| 32 | 3.6 / 1.9 | 5.5 / 4.5 |
| 64 | 10.8 / 4.6 | 19.7 / 7.7 |
| 128 | 29.0 / 11.2 | 34.2 / 15.2 |

The dense 128-cell live scene's median frame interval improved from 163.7 to 42.6 ms (95th percentile: 242.4 to 59.6 ms). Render preparation itself remained about 4.3 ms; the full frame includes simulation catch-up and Pixi geometry/rendering work. This is a substantial improvement, but that crowded scene is still below 60 fps. Timings vary with hardware, browser and evolving crowd layout; these samples do not guarantee smooth play at arbitrary populations.

Run `npm run test:browser -- tests/browser/performance.spec.ts` to repeat the sample and save its metrics/screenshot. For CPU samples in PowerShell, set `$env:POND_PROFILE = '1'` before running it, then `Remove-Item Env:POND_PROFILE` afterward. No cell caps or lower simulation rates were introduced.

The round continues while any of your cells survives. After losing the last one, respawn returns you to one starting-size cell. AI can reproduce too. Extra AI offspring do not respawn after death. There is no organism-count cap. The pond is now 4800 × 3600, 1.5× wider and taller (2.25× the area); zones and dissolved patches scale with it. Crowding does not block division: daughters separate through the solid-body collision system, pushing nearby cells aside as needed and staying inside the map. Division cannot interrupt an active ability, stun, protection or capture.

Manual checks: grow to the displayed threshold, press R, confirm two **YOU**/player markers and unchanged total biomass, then steer both daughters. Pressing R again immediately must not split them. As Amoeba, swim toward nearby eligible prey and press Space; confirm the nearest ready, forward-facing daughter attacks and pays the cost. As Didinium, point at prey and check the closest ready daughter attacks. Verify the round continues after one daughter is eaten. Inventory totals include all your living cells; each retains independent reserves and feeding needs.

1. **Solid collisions:** steer into another organism. Bodies press against and slide around each other instead of passing through. Test a Didinium lunge or Paramecium discharge near other organisms. Knockback also respects bodies and walls. Cilia, flagella, optical halos and ability effects are decorative; membrane bodies are solid.
2. **A living pond:** start with 22 AI neighbors: three Amoebae, six Paramecium, three Didinium, five Euglena and five Diatoms. Labels identify species and biomass; controlled cells also show YOU. Activity announcements are hidden. Follow a Paramecium to watch it forage; approach smaller prey as a predator to see it flee. Hunters choose prey their species can actually eat.
3. **Amoeba:** collect mixed foods, approach a smaller eligible organism until your membranes nearly touch, swim toward it and press Space. Other smaller Amoebae are edible; your own controlled cells are protected. Stay within reach through the 0.9-second wrap. Fast prey can escape; defensive discharge can interrupt capture. A failed target check costs nothing, but an interrupted committed attempt keeps its cost and cooldown.
4. **Paramecium:** gather food particles and use tight turns to escape. Press Space to push nearby rivals away and discharge trichocysts. Didinium resists the push, so early evasion matters. Protein-rich food replenishes the nitrogen needed for repeated defensive use.
5. **Didinium:** hunt Paramecium. Space lunges into prey; solid membrane contact triggers a stun and capture. Particles do not feed you. Without enough energy to strike, basic contact feeding remains available: touch eligible prey and stay close for 2.5 seconds. Depleted energy drains mass; 30 continuous seconds without energy causes death.
6. **Single-celled life only:** all pond organisms are unicellular. Watch for Amoeba and Didinium predators; no multicellular organisms are included.
7. **Death and respawn:** being eaten shows the cause of death. After three seconds, click **Respawn** to return as the same species at starting mass with clean inventories, fresh reserves and reset abilities. The new position avoids living bodies. A soft ring marks three seconds of protection; neither side can attack during this settling period. AI organisms return after seven seconds to keep the pond populated.
8. **Nutrition:** open **Absorbed nutrients** to inspect current stock. Watch prey enter digestion before it contributes to growth. AI organisms have independent inventories and pay the same feeding, growth and ability costs.
9. Resize the window, or switch tabs and return. The canvas resizes, input clears on focus loss, and the pond continues running while hidden. **Change species** starts a fresh local pond.

| Playable species | Passive / diet | Space | Cost / cooldown | Weakness |
| --- | --- | --- | --- | --- |
| Amoeba proteus | Phagocytosis; all four particle foods and eligible smaller pond prey including other Amoebae, with less than 70% of its mass | Pseudopod engulf | 8 energy / 6s | Slow movement; prey can escape or interrupt capture |
| Paramecium caudatum | Cilia; fastest movement and tightest turns; particle feeding | Trichocyst discharge | 6 energy + 0.5 nitrogen / 5s | Didinium specializes in hunting it and resists discharge |
| Didinium nasutum | Specialist hunter; Paramecium up to 150% of its mass; resists trichocysts | Toxicyst strike | 4 energy / 3s | No particle grazing or general prey diet; high upkeep and starvation |
| Euglena gracilis | Photosynthesis; CO₂, ammonium and phosphate uptake | Phototaxis, 2s of turning/swimming toward a favorable light zone | 3 energy / 6s | Vulnerable; loses 0.35 mass/s in darkness down to its floor |
| Navicula radiosa | Silica frustule; CO₂, nitrate, phosphate and silicate uptake | Glide, 1.2s of directed substrate movement | 4 energy / 7s | Very slow; growth needs silicate |

### New environmental checks

1. **Euglena:** start in the sunlit clearing. Without eating particles, biomass increases as you absorb dissolved CO₂, ammonium and phosphate. The pale green dotted ring marks a nutrient patch. Move away from its center and press Space: the eyespot glows and sends animated gold waves toward favorable light while you turn and swim toward it. No charge is made if no favorable light is found or you are already at its center.
2. **Shade:** travel northeast from spawn to the indigo zone centered at (3075, 975), or southwest to (1500, 2700). Euglena shows **Darkness · losing mass**. Photosynthesis pauses; available stored material can still replenish energy. Diatom also stops production in darkness but has no automatic dark-shrink penalty.
3. **Diatom:** remain in a lit nutrient patch to grow. Silicate supplies new shell construction; missing silicate prevents growth without stripping existing protection. Space makes a short glide in your steering direction. Compared with an unprotected cell, a predator needs about 1.54 times as much mass to qualify to engulf it, and capture takes 2.5 times as long. A sufficiently large predator can still eat it.
4. **Cold currents:** head west from spawn toward (1425, 1650), or east toward (3375, 2025). Blue arrows show drift. Your cell moves with the current even while idle, and directed movement slows to 65%. Cells still collide and stay within the pond. Membership uses each cell's center; the visible circle is the boundary.
5. **Resources:** dissolved patches are shared, depletable and gradually replenished. Uptake is rate-limited and species-specific; heterotrophs cannot graze them. In **Absorbed nutrients**, quantities are current unused stock, so rapidly processed resources may stay near zero. Missing CO₂ stops carbon fixation; missing nitrogen/phosphorus stops new biomass. Existing reserves allow brief growth after leaving a patch. Production and biomass remain capped.
6. **AI and respawn:** producers seek lit patches and flee predators; Diatoms use glide to escape. Producer spawns and respawns prefer clear sunlit nutrient patches. Predator AI and both sides of the food chain use the same nutrient and ability rules as players.

Gold water is illuminated; indigo is dark; ordinary pond water has dim light (30% production). Overlapping shade wins over brighter light. The resource model uses normalized game units, not laboratory concentrations. Euglena's dark shrinkage and light-only growth are gameplay rules; it can grow heterotrophically in nature. Trace minerals/vitamins are assumed available. Timed glide and shell capture modifiers are abstractions of substrate motility and structural protection; there is no general damage/health system or invulnerability button.

All timings, sizes, nutrient quantities, movement speeds and prey cutoffs are game balance abstractions. Biological sources and caveats are in `src/data/facts/pond.ts`; Microdex collection arrives in M6.

## Nutrients and food chains

Only one hunter can attack a prey cell at a time. The first accepted engulf, targeted lunge, or contact-feeding attempt claims it until capture, escape, interruption, a missed strike or death. Later attempts cannot steal it, add a stun, or spend energy/cooldown on a rejected attack. AI seeks unclaimed prey. This is a temporary balance rule shared by AI and player cells.

Amoeba engulfing begins only within an 8-unit membrane gap; this start distance does not scale up with mass. A distant attempt shows **Move closer to begin engulfing** and costs nothing. Once started, the existing hold/escape distance and 0.9-second capture duration remain. Two connected, translucent pseudopods extend and curl around the prey, then seal; successful capture draws the prey into a fading food vacuole. Escapes retract empty pseudopods. Organelles stay visible, and the animation works for every hunter cell, including offspring and AI. These visual extensions do not change physical collision bodies or nutrient pickup range.

To check: approach a smaller Amoeba and press Space at close contact. Try attacking the same prey with another controlled cell during the wrap; only the first should engage. Play a non-predatory species and check that its Divide panel shows a 30% threshold.

| Food | Appearance | Main benefit | Digestion / renewal |
| --- | --- | --- | --- |
| Carbohydrate flake | Gold circle | Energy and carbon | 1.2s / 9s |
| Protein fragment | Lavender diamond | Nitrogen for growth and ability recovery | 2.2s / 11s |
| Lipid-rich fragment | Coral capsule | Membranes and energy | 3s / 13s |
| Mixed detritus | Green cluster | A balanced mixture | 2.8s / 12s |

Compatible food is absorbed immediately on membrane contact, even with full processed reserves or other meals digesting. The simulation and renderer share the same membrane outline. Swept contact follows resolved movement paths, including motion between ticks. Food labels stay in the static **Food in this drop** guide.

Every organism owns its current nutrient stock separately from processed reserves and digestion. M4 adds dissolved CO₂, ammonium, nitrate, phosphate and silicate to the five organic constituents. Surplus stock stays stored until used; dissolved uptake stops at its storage limit. Reproduction shares these quantities equally; no extra nutrient fee is charged in this initial division model.

Capture transfers a configured fraction of prey body constituents plus its remaining raw nutrient stock into digestion. It does not also award direct biomass. Untransferred material and processed prey reserves are lost in this simplified food-chain model. Growth consumes a mixture of energy, carbon, nitrogen, phosphorus and lipids, with caps and bottlenecks.

Food placement checks every living organism, with clearance for its radius, membrane protrusions and the particle itself. This applies to initial placement, nearby food, renewal and organism respawn. Renewal checks again when hidden food reappears. Organisms may subsequently move into existing food; incompatible eaters leave it untouched.

## Verify

```sh
npm test
npm run build
npm run test:browser
```

- **132 simulation/render-state tests:** feeding, environment, lifecycle, uncapped division, nutrient transfer losses, emergency fleeing, colony steering, movement-based Amoeba targeting, ability animation lifetimes and collision regressions, alongside reproduction and resource conservation.
- **Production build:** TypeScript checks and `dist/` output. `npm run preview` serves it locally.
- **25 browser tests:** five-species selection, feeding, all kits, producer growth, environment feedback, AI, death/respawn, R division, absorption animations on both controlled cells, group steering, closest-cell attacks, continued survival and resizing. They use installed Microsoft Edge and a local server on port 4173. Screenshots are in `test-results/`. To use installed Chrome in PowerShell, set `$env:PLAYWRIGHT_CHANNEL = 'chrome'` first.

Browser tests enable a development-only simulation hook for controlled combat setups; ordinary development and production builds do not expose it. Live ecosystem and respawn checks run the real simulation.

## Structure

- `src/data/`: arena populations, playable rosters, species, abilities, directed counters, AI profiles, separate NPC definitions, nutrient/food/metabolism profiles, fact sources and lifecycle settings. Definitions are validated at load.
- `src/sim/`: deterministic 30 Hz commands, metabolism, abilities, geometry, solid-body collision, AI, death/respawn, seeded spawning and snapshots. No DOM, PixiJS or wall-clock dependencies. AI produces the same movement/activation commands as player input.
- `src/client/`: selection, input, automatic camera, PixiJS drawing and HUD. It follows simulation-resolved movement paths and renders authoritative state.
- `tests/`: focused simulation fixtures, populated-pond regression checks and browser tests.

A tick renews dissolved patches, handles due respawns and input/AI decisions, checks atomic ability activation, performs dissolved uptake/light-dependent production and metabolism, applies current/steering motion through solid collisions, resolves capture, then collects particle food. Newly captured meals cannot be metabolized in their pickup tick. Death clears ability and nutritional state; dead organisms cannot move, feed or block other bodies. Snapshots include independent copies of dissolved patch stocks.

Stop after reproduction. M5 adds arena selection and Human Gut; later milestones add Microdex collection, audio, touch controls and multiplayer. Didinium still needs its future buff pass, recorded in PLAN.md; its new division threshold follows the higher cutoff requested for hunters.

## Multiplayer prototype (M7 brought forward)

M5 (additional arenas) and M6 (Microdex, audio and mobile polish) are deferred. Multiplayer currently uses the existing Pond Water roster and desktop controls.

```sh
npm run build:prototype
npm start
```

Open http://localhost:3000. Enable **Multiplayer prototype**, enter a room name, then choose your species. Open a second browser tab with the same room name to play together. Each player owns a separate colony; mouse/WASD, Space, R and respawn work through the server. Rooms accept 20 players and show live counts and a biomass leaderboard. A different room name creates an isolated pond. Local play remains available with the checkbox off.

For another computer on the same network, open `http://<server-LAN-IP>:3000`; both players must use the same server address and room name. Public internet play requires hosting the Node server with HTTPS and a reverse proxy that allows unbuffered `/api/events` responses. This change does not deploy a public server. Set `PORT` and `HOST` to configure listening (defaults: 3000 and 0.0.0.0).

For development, keep `npm start` running and use `npm run dev` in another terminal. Vite proxies `/api` to port 3000. Rebuild/restart the server after simulation/server edits.

The authoritative Node server runs the shared simulation at 30 Hz. Clients send validated movement/action commands and receive compact snapshots at 15 Hz with interpolation. Dependency-free HTTP POST plus server-sent events is the prototype transport; WebSockets and actor-state deltas remain future improvements; food changes already use deltas. Food, nutrients, captures, cooldowns, division and respawns are computed by the server. Session tokens bind input to its owner. Movement expires after half a second without input; one-shot actions are consumed once. Disconnecting removes that player's colony, and empty rooms are destroyed. Reconnecting starts a fresh organism.

Didinium balance: base speed 190 (minimum 120), contact capture 1.8 seconds, strike speed 400 for 0.36 seconds, 3-second cooldown, 4 energy per strike, upkeep 0.65 plus 0.3 while moving. Its Paramecium-only diet, prey limits, 75% assimilation and higher division threshold remain. These are initial playtest values rather than a claim of final competitive balance.

Original prototype validation: 136 simulation tests passed, including a 20-player room scenario, independent controls, rival-player predation, owner-scoped respawn, colony inheritance, disconnect cleanup, room capacity/isolation and input validation. Client and server production builds pass. The browser suite includes a two-player integration check, but local socket connections are blocked by the execution environment (EACCES), so browser and real network load verification remain outstanding. Run `npm test` and `npm run test:browser` locally with the multiplayer server running.

Prototype limitations: actor snapshots may still become bandwidth-heavy with very large populations; no client prediction, reconnect recovery, accounts or durable statistics. The leaderboard is live biomass. This is a local/LAN playtest prototype, with public hosting and production hardening still pending.


### Multiplayer latency improvements

Rebuild with `npm run build:prototype`, stop the old server with Ctrl+C, run `npm start` again, and reload every connected browser. Client and server must both use the updated packet/input format.

Reproduction retains the existing 30% Paramecium threshold, resource conservation and uncapped populations. Simultaneous divisions now perform one final collision solve for the whole batch, rather than solving the full pond after each birth. Spawn corridor checks reject distant bodies before detailed distance calculations. AI threat checks share predator candidate lists by prey species while retaining immediate emergency fleeing. Dead player descendants are removed, retaining one respawn record per eliminated owner.

The server encodes shared render data once per room, sends compact actor tuples, and sends full nutrient/digestion details only to the owning player. Food positions and availability use incremental updates after a full initial packet. Congested streams skip updates and resynchronize food instead of accumulating stale frames. Snapshots run at 15 Hz (67ms intervals); the decoder builds movement paths between received positions for smooth interpolation. Up to four input requests can overlap, with sequence validation preventing steering rollback and duplicate button presses while preserving late, unseen actions.

Controlled local measurements (not internet ping): the 256-cell synchronized division tick fell from about 296ms to 46ms. Preparing a 20-client broadcast fell from roughly 24–31ms to 1–2ms; recurring payload fell from 7.19MB to 0.98MB total across those clients (86% smaller per broadcast). An AI stress scene starting with 256 Paramecia and reproducing into roughly 512 measured 14ms median / 24ms p95 simulation ticks. Very large division bursts can still exceed the 33ms tick budget; arbitrary populations are not guaranteed smooth.

Regression coverage includes food resynchronization and prior-snapshot immutability, ownership, out-of-order commands, exactly-once late actions, movement interpolation and dead-descendant cleanup. `tests/latency-benchmark.test.ts` reproduces the population/broadcast checks and records local measurements in the ignored test temporary directory. Browser/network verification remains blocked by this environment's loopback EACCES restriction.


### Hunger and starvation

Every live player/AI cell has its own hunger bar (100% means well nourished), separate from ability energy. The HUD shows the least-fed controlled cell, warns at 25%, and counts starving cells. Being large or dividing does not remove the need to feed.

Processed energy, carbon, nitrogen, phosphorus and lipids pay continuous maintenance before growth. Demand scales with biomass, with a small minimum per cell. Compatible organic food and captured prey supply reserves through normal digestion; photosynthetic species use light and their supported dissolved resources. Picking up food does not instantly reset hunger, and carbon alone cannot replace missing building materials. Silicate remains a diatom growth requirement rather than a continual shell upkeep cost.

Sustained maintenance shortages drain a full hunger bar in about 45 seconds. A fully supplied cell restores it in about 12 seconds. At zero, the cell loses at least 0.35 biomass/s or 1.5% of current biomass/s, whichever is higher (Didinium retains its higher base loss). After 30 accumulated starvation seconds it dies through the normal lifecycle. Adequate recovery to 25% clears the starvation timer; a tiny meal does not erase it immediately. Amoeba/Paramecium can shrink to 6.25 mass, Euglena to 4.5, Diatom to 4, and Didinium retains its 12.5 floor; the floor does not prevent starvation death in the live pond.

Cells at or below 25% cannot divide. Otherwise the existing species mass thresholds and uncapped reproduction remain. Daughters inherit their parent's hunger percentage and accumulated starvation time; biomass, inventories and reserves still split equally. Respawn starts a new, fully nourished organism. Controlled simulation fixtures without a lifecycle continue to clamp at the mass floor, while actual local/multiplayer ponds enforce starvation death.

Validation: 151 simulation tests pass, including all-species starvation, resource-poor AI colony loss, carbon-only deficiency, balanced recovery, photosynthetic survival, division demand conservation, respawn and multiplayer hunger state. The hunger-bar browser check is in `tests/browser/hunger.spec.ts`; browser execution remains blocked here by local connection EACCES. Rebuild/restart with `npm run build:prototype` then `npm start`, and reload clients together.
