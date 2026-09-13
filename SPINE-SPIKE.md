# Spine attack spike (Round 1)

Feature-flagged **Mixer + Pixi Spine** overlay so casting QWER plays an official Axie Mixer attack animation on the casting hero.

## How to run

### Preferred (Vite + bundled Mixer)

```bash
cd /workspace/lunacia-rift
npm install
npm run dev
```

Open the printed local URL (default `http://localhost:5173`).

Production static build: `npm run build` outputs `dist/`.

### Static fallback (no bundler)

Uses esm.sh CDN for Pixi/Mixer JS + vendored Mixer JSON under `vendor/mixer/`:

```bash
cd /workspace/lunacia-rift
python3 -m http.server 8765
```

Open `http://localhost:8765`. Disable Spine with `?spine=0` (Canvas PNG heroes only).

## What it does

- Transparent Pixi canvas (`#spine-overlay`) over the game canvas, camera-synced (same zoom/pan as `game.js` `cam`)
- Builds Mixer spines for Buba / Olek / Puffy **stand-ins**
- On successful `castSkill`, calls `playAttack`:
  - **melee-ish** -> `attack/melee/tail-smash`
  - **Puffy Q (ranged)** -> `attack/ranged/cast-fly`
  - then queues `action/idle/normal`
- Hides Canvas-drawn hero **bodies** while Spine is ready (nameplates / rings stay)

## Gene source (important)

**Sample / demo genes** from Mixer docs -- **not** real Buba / Olek / Puffy DNA.

Starter mascots (Buba / Puffy / Pomodoro) are fixed assets; Mixer is for generative gene Axies. This spike uses the Mixer sample hex as a stand-in so attack anims ship for Round 1. Round 2 BYOA should plug real Axie Core genes.

Sample hex (same for all three starters in this spike):

`0x20000000000003000181a09082040000000100040800800400000090086044020001000010008002000100100840450200010004186044020001001008808404`

## Animations used

| Name | When |
|------|------|
| `action/idle/normal` | Default loop |
| `attack/melee/tail-smash` | Most QWER casts |
| `attack/ranged/cast-fly` | Puffy Q (Bubble Kiss) |

## Feature flag

- `window.USE_SPINE_HEROES` (default `true`)
- URL `?spine=0` forces Canvas-only
- If Mixer/Pixi fails to load, gameplay continues with PNG heroes

## Limitations / next steps

- One sample gene look for all three starters (visual stand-ins)
- Enemy bot casts also trigger Spine attacks
- No accessories; not all 9 classes packed
- Scale / foot-plant tuning TBD
- Optional: official 3D starter idleattack / walkattack if Mixer stand-ins are undesirable

## Files

- `js/spineHeroes.js` -- Mixer init, Pixi overlay, `playAttack`
- `js/game.js` -- `castSkill` hook + hide Canvas bodies when Spine ready
- `js/main.js` -- module entry attaches overlay
- `vendor/mixer/` -- vendored Mixer package data for static serve
- `package.json` / `vite.config.js` -- Vite app

## Standalone proof page

Open `/spine-spike.html` for a minimal Mixer+Pixi page (Attack melee / Attack ranged). Gene source: Mixer sample hex.

## Verified in this environment

- Static server + esm.sh CDN path loads Mixer spines (`spine-spike.html`, main game overlay).
- `?spineDemo=1` starts match and casts Q (combat log + skill CD).
- `?spine=0` keeps Canvas PNG heroes (feature flag).
- Preferred Vite/`node_modules` path is configured in `package.json` but package install was not runnable in the agent sandbox; run install locally for `dev`/`build`.
