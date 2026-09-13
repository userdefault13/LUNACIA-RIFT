# Lunacia Rift — Round 1 Prototype

**Pitch:** 1v1 three-lane war where you command three of your own Axies, one per lane, and end the fight at the enemy Nest.

Axie Infinity Vibeathon entry. Local draft pending push to Origin repo `user0xdef-ult/LUNACIA-RIFT`.

## Axie Core / BYOA

Round 1 ships a **mock starter roster** (Buba, Olek, Puffy) so the loop is playable without wallet or ownership checks. The intended Round 2 path is **Bring Your Own Axie (BYOA)** via Axie Core: your real Axies, parts, and class identity drive the same lane roles — hold / tempo / finish — without inventing new creature IP.

## How to run (judges)

Static files / Canvas. From the project folder:

```bash
# Mac (canonical play path)
cd ~/Dev/lunacia-rift && python3 -m http.server 8765
```

Open **http://localhost:8765** — hard-refresh if you already had a tab open.

Do **not** open `index.html` as `file://` (fetch for `data/roster.json` / map JSON will fail).

Optional: `npm install && npm run dev` (Vite). Spine spike docs: [`SPINE-SPIKE.md`](./SPINE-SPIKE.md). Defaults: CDN PNG heroes (`?glb=1` / `?spine=1` opt-in).

## Arena map (Aseprite-Mappie Tiled tilemap)

Primary backdrop is a **Tiled tilemap** from Aseprite-Mappie (ASCII → Tiled JSON/CSV → painted tileset), not a single painted arena plate.

| Asset | Role |
|-------|------|
| `assets/map/lunacia_rift.tiled.json` | Tiled map (94×50 @ 16px → 1504×800) |
| `assets/map/lunacia_rift_tileset.png` | Hand-authored Lunacia jungle tileset |
| `assets/map/lunacia_rift.csv` / `.legend.json` / `.meta.json` / `.txt` | Source ASCII + legend + layout meta |
| `assets/map/lunacia_rift.png` | **Optional fallback only** if Tiled fails to load (retired Origins painted plate) |

Runtime: `js/tilemap.js` loads the JSON + tileset, bakes once to an offscreen canvas, and `js/game.js` crops to the 1500×800 playfield (no procedural trees while the tilemap is active). Soft lane guides stay optional/dim. Collision (`FOREST` rects) is unchanged — lanes Y={130,400,670}, gaps X=[420,750,1080]. Brief: `assets/map/LUNACIA_RIFT_TILEMAP_BRIEF.md`. Rights: Vibeathon-only — see `assets/map/NOTICE.md`.

## Origins web-vfx (skill FX)

Drop-in additive atlas playback from [`axieinfinity/axie-origins-asset-kit`](https://github.com/axieinfinity/axie-origins-asset-kit) (`web-vfx`).

- **Assets:** `assets/origins-vfx/` (~147MB, 107 clips + `index.json`) and starter wavs in `assets/origins-sfx/`
- **Runtime:** `js/originsVfx.js` — canvas-only `AdditiveAtlas` + overlay `#origins-vfx-overlay` (`pointer-events: none`, `mix-blend-mode: plus-lighter`). **No Pixi** for VFX.
- **Scope:** QWER casts on starters (Buba / Olek / Puffy). `USE_SPINE_HEROES` / `USE_GLB_HEROES` default **false** — CDN PNG heroes; opt-in `?spine=1` / `?glb=1`.
- **Paths:** relative `assets/origins-vfx/...` so `python3 -m http.server` and Vite both work.
- **License:** Vibeathon-only — see `assets/origins-vfx/NOTICE.md`. Credit: `axieinfinity/axie-origins-asset-kit`.

| Starter | Q | W | E | R |
|---------|---|---|---|---|
| Buba (Plant) | `plant_bite` | `plant_slash` | `shield` | `plant_smash` |
| Olek (Beast) | `beast_bite` | `beast_gore` | `beast_cast` | `beast_smash` |
| Puffy (Aquatic) | `aquatic_projectile` | `aquatic_slash` | `aquatic_cast` | `aquatic_smash` |

Boot preloads those ~12 clips; the full catalog stays on disk for later Pack / class skills.

## Three.js GLB heroes (kit mascot stand-ins)

Animated GLB overlays via Three.js (`three@0.185.1`) + `GLTFLoader` / `AnimationMixer`. **These are kit mascot stand-ins** — the Builder Kit does **not** ship official Buba / Olek / Puffy GLBs.

| Starter | Role | Stand-in GLB | Clips used |
|---------|------|--------------|------------|
| **Buba** (Plant) | hold | `assets/glb/paladill.glb` | Idle, Walk, `Hammer.Attack` (Q/W), `Hammer.Skill` (R); E soft (no oneshot) |
| **Olek** (Beast) | tempo | `assets/glb/pomodoro.glb` | Idle, Walk, `Staff.Attack`, `Staff.Skill` |
| **Puffy** (Aquatic) | finish | `assets/glb/bing.glb` | prefer `Cannon.Idle` / `Cannon.Walk` / `Cannon.Attack` / `Cannon.Skill` |

- **Runtime:** `js/glbHeroes.js` — transparent `#glb-overlay` WebGL canvas (`pointer-events: none`, z-index under `#origins-vfx-overlay`). Heroes only; scale constant **`TARGET_WORLD_PX = 56`** (~48–64 feel, follows game camera zoom). Nest / Sanctuary / Den UI stay clickable on the main canvas (HP bars / selection rings stay on `#game`).
- **Flag:** `window.USE_GLB_HEROES` default **false** (CDN PNGs). Enable with **`?glb=1`**. Load failures fall back to PNG.
- **Spine:** `USE_SPINE_HEROES` stays default **false** — Mixer overlay is not re-enabled.
- **Import map:** `index.html` maps `three` → `node_modules/three/...` so `python3 -m http.server 8765` works without a bundler.
- **Rights:** Vibeathon / approved Axie program only — see `assets/glb/RIGHTS.md` and `assets/glb/NOTICE.md`.

QWER still fires Origins additive VFX; GLB plays Attack/Skill oneshots in parallel.

## Controls

| Input | Action |
|--------|--------|
| **Click** on the map | Move the controlled Axie (click-to-move). Forest gaps between lanes let you walk mid-map between top/mid/bot. **Click your Den/Spire when the selected Axie is nearby (within 2 radii)** — Den: upgrade/breed Packs; Spire: repair/upgrade. Enemy Dens/Spires are not clickable |
| **Hold Shift** or **Hold to zoom out** button | Zoom out to full map while held; release returns to tight zoomed-in follow on the selected Axie (~2.7×). **Fog of War** darkens the map outside vision of your living Axies (and lightly your Packs / Spires / Dens / Nest); enemy units outside vision are hidden |
| **Tab** or **1 / 2 / 3** | **Tab** cycles your three Axies (living preferred; prevents browser focus steal). **1/2/3** select directly |
| **Q W E R** | Mouth / Horn / Back / Tail specials (per Axie — see below) |
| **Z / X / C** or HUD buttons | Start 10s lane-reassign channel (only inside your **Sanctuary**) |
| Shop buttons | Buy Boots / Vial / Relic for the **currently selected** Axie |
| **Den modal** | Click a player Den: upgrade Packs (100g→L1, 160g→L2) or **breed** Pack species (50g; pick 2–3 roster Axies as parents → **uniform random among all 9 Axie classes** for future Packs) |
| **Spire modal** | Click your Spire (T1/T2): **Repair** (~35% max HP; 60g light / 120g heavy) or **Upgrade** (120g→L1, 200g→L2: +maxHp/+atk). No rebuild if destroyed |
| **Top-left vitals** | Axie + Nest HP bars overlay the canvas (not in the bottom HUD) |

**Specials (Round 1):** cooldowns from the HUD. **Buba** — Leaf Bite (melee+heal), Wooden Stake (slow poke), Pumpkin Shell (shield), Carrot Slam (AoE). **Olek** — Hungry Snap (bite+haste), Ram Horn (dash), Fur Mantle (move speed), Whip Lash (cleave). **Puffy** — Bubble Kiss (projectile), Coral Spike (armor shred), Scale Veil (damage reduce), Tidal Finish (execute). Bot casts occasionally when off CD and a foe is in range.

Uncontrolled allies run simple lane AI: weak last-hits, hit Spires when no enemy hero is nearby, retreat under 30% HP toward Sanctuary.

You fight a **bot trainer** using the same three starters on the opposite side.

## Naming glossary (player-facing)

| Term | Meaning |
|------|---------|
| **Nest** | Win objective at each base. Unlocks after any **two** of that team’s **inner (T2) Spires** are destroyed. Win/lose when Nest HP hits 0. |
| **Spire** | Lane structure. Outer **T1**, inner **T2**. Twelve total (six per side). Click yours to repair HP or upgrade fortification. |
| **Den** | Pack-spawn structure near each Sanctuary (one per lane per team). Click to upgrade Packs / breed Pack species. Destroy a Den to stop that lane’s Packs and route foe Packs toward the Nest. |
| **Pack** | Lane creeps that march from Sanctuaries; drawn with that Den’s Pack class sprite (any of the 9 Axie classes). Gold from last-hits. |
| **Sanctuary** | Home regen zone and the only place to reassign lanes (10s channel). |

Product title **Lunacia Rift** is the only use of “Rift” in UI copy.

## Starters & systems

- **Buba** (Plant, hold) · **Olek** (Beast, tempo) · **Puffy** (Aquatic, finish)
- One Axie assigned per lane at start
- Gold from Pack last-hits and destroying Spires / Dens
- Shop: **Boots** (move), **Vial** (HP), **Relic** (haste) — per Axie
- Dens: click to upgrade Pack levels / **breed** Pack species from 2–3 of your Axies (flavor parents; outcome is uniform random across all **9 Axie classes**; lane Axie unchanged); destroy Den to cut that lane’s spawns
- Spires: click to **repair** (60g/120g) or **upgrade** (120g/200g → +maxHp/+atk); destroyed Spires stay down (no rebuild in Round 1)
- **Hero-kill levels:** Round 1 mocks AXP via hero-kill levels; Round 2 should write real AXP.

## Species / Genes / Traits

Roster data lives in `data/roster.json` (`species` + starter `genes`). Packs and heroes share a **9-class** identity.

### Genes (parts)
Each starter has six gene slots: **eyes / ears / mouth / horn / back / tail**. Mouth→Q, Horn→W, Back→E, Tail→R. Eyes/ears carry working passives (no longer stubs):

| Starter | Eyes | Ears |
|---------|------|------|
| Buba | +5% last-hit gold | +8 Sanctuary regen/s |
| Olek | +5% move when chasing | +40 AI aggro range |
| Puffy | +5% dmg vs &lt;40% HP | +6 attack range |

`parts` remains an alias of `genes` for UI/compat.

### Class advantages (`classMult`)
Prefer `classTriangle.advantages` matrix (`attacker → defender → mult`). Fallback: legacy `strongVs` / `weakVs` + `modifier`.

| Tier | Matchup | Mult |
|------|---------|------|
| Primary | Plant &gt; Beast &gt; Aquatic &gt; Plant | ±15% |
| Secondary | Bird &gt; Bug &gt; Reptile &gt; Bird | ±12% |
| Tertiary | Dawn &gt; Dusk &gt; Mech &gt; Dawn | ±12% |
| Cross | Plant&gt;Reptile, Aquatic&gt;Bird, Beast&gt;Bug, Plant&gt;Dusk, Dawn&gt;Mech | ±8% |

### Pack balance (Den L0 baseline ≈ 90 HP / 12 ATK / 55 SPD)

| Class | HP× | ATK× | SPD× | Armor | Trait | Fantasy |
|-------|-----|------|------|-------|-------|---------|
| Plant | 1.25 | 0.85 | 0.85 | 4 | Thick Hide | tank wave |
| Beast | 1.00 | 1.20 | 1.15 | 1 | Frenzy | shred |
| Aquatic | 0.90 | 1.10 | 1.00 | 1 | Torrent (+5% vs low HP) | poke |
| Bird | 0.70 | 1.25 | 1.35 | 0 | Gale | glass / fastest |
| Bug | 0.95 | 1.12 | 1.05 | 1 | Venom (+8% vs low HP) | burst |
| Reptile | 1.20 | 0.95 | 0.80 | 6 | Scale Wall | wall |
| Dawn | 1.00 | 0.80 | 1.00 | 3 | Blessing (ally Pack heal + gold) | support |
| Dusk | 1.05 | 1.00 | 1.00 | 3 | Drain (8% lifesteal) | sustain |
| Mech | 1.20 | 1.00 | 0.75 | 8 | Siege Plating (+25% vs structures) | siege |

Working Pack passives: Dawn heals nearby ally Packs (~3 HP/s in 70px), Dusk lifesteals on hit, Mech hits Spires/Nest/Dens harder, Aquatic/Bug execute-style bonuses, classMult Pack↔hero.

## Match length

Target demo: **~7–10 minutes** to a Nest take with focused play.

Tuned for Round 1 judging: Pack waves every **22s**, Spire/Den/Nest HP bumped vs the early draft, starting gold **200**, shop slightly cheaper, player heroes +10% HP cushion, bot skill spam reduced. Numbers live in `js/game.js` + `data/roster.json`.

## Layout

```
/workspace/lunacia-rift/
  index.html
  package.json / vite.config.js
  css/style.css
  js/game.js         # simulation + canvas (+ Spine hooks)
  js/main.js         # UI bindings (module)
  js/spineHeroes.js  # Mixer Spine overlay spike
  data/roster.json
  assets/axies/
  vendor/mixer/      # Mixer data for static fallback
  SPINE-SPIKE.md
  README.md
```

## Submission checklist (Round 1)

- [x] Playable 1v1 vs bot — Nest destroy = win/lose
- [x] Three-lane map + forest gaps (Mappie tilemap + `*.game.json` contract)
- [x] Starters Buba / Olek / Puffy with distinct QWER kits + Origins VFX
- [x] Dens (upgrade/breed) · Spires (repair/upgrade) · Shop · FoG · camera zoom
- [x] Glossary terms only: Nest / Spire / Pack / Sanctuary / Den
- [x] Local static serve (no wallet required)
- [ ] Push/sync Origin repo `user0xdef-ult/LUNACIA-RIFT` when ready
- [ ] Optional judge clip / screenshots

## Round 2 deferrals

- Ronin login / real Axie ownership (BYOA)
- Ranked, fog polish, 5v5
- On-chain rewards / new token
- New creature IP
- Richer skill VFX, last-hit forgives, smarter bot
- Real AXP writeback (Round 1 uses hero-kill level mock)
- Origin repo sync (`user0xdef-ult/LUNACIA-RIFT`)

## Out of scope (not built)

Ronin login, real ownership, ranked, fog polish, 5v5, on-chain rewards, new creature IP, new token.


## Art

Starter + Pack class sprites are official Axie Infinity CDN transparent PNGs (`assets/axies/{buba,olek,puffy}.png` plus `{plant,aquatic,beast,bird,bug,reptile,dawn,dusk,mech}.png`). Drop in Builder Resource Kit / official starter files over those paths when available (see `assets/axies/ATTRIBUTION.md`).

## Tech

Vanilla HTML + Canvas + JS core. Optional Vite + Mixer + Pixi Spine overlay (`USE_SPINE_HEROES`). See `SPINE-SPIKE.md`.
