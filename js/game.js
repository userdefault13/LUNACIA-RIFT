/**
 * Lunacia Rift — Round 1 prototype game core
 * Click-to-move control. Tab / 1-2-3 swap Axies.
 */
(function (global) {
  'use strict';

  /** Round-1 Spine spike flag. Spine off by default; ?spine=1 enables Mixer overlay. */
  function spineHeroesActive() {
    const api = global.SpineHeroes;
    return !!(api && api.ready && api.hideCanvasHeroes);
  }

  /** Three.js GLB kit-mascot overlay (default on; ?glb=0 disables). */
  function glbHeroesActive() {
    const api = global.GlbHeroes;
    return !!(api && api.ready && api.hideCanvasHeroes);
  }

  const W = 1500;
  const H = 800;
  const LANES = ['top', 'mid', 'bot'];
  // Layout defaults — overridden by Mappie *.game.json via applyGameContract()
  let LANE_Y = { top: 130, mid: 400, bot: 670 };
  let LANE_PATH_W = 72; // visual corridor thickness
  let PLAYER_BASE_X = 90;
  let ENEMY_BASE_X = 1410;
  let SANCTUARY_R = 70;
  // Forest bands between lanes; gaps are clear openings for lane switches
  let FOREST_GAP_XS = [420, 750, 1080];
  let FOREST_GAP_HALF = 50; // ~100px clear corridor (axie r≈16 + margin)
  const GAME_CONTRACT_URL = 'assets/map/lunacia_rift.game.json';
  const PACK_INTERVAL = 22; // seconds between Pack spawns (demo ~7–10 min Nest)
  const NEST_UNLOCK_T2 = 2;
  // Den Pack upgrade: level 0..2. Cost to raise to next level.
  const DEN_MAX_LEVEL = 2;
  const DEN_UPGRADE_COST = [100, 160]; // 0→1, 1→2
  const BREED_PACK_COST = 50; // Den modal: breed Pack species from 2–3 parents
  // Spire repair / upgrade (click modal). Destroyed Spires stay dead (no rebuild).
  const SPIRE_MAX_LEVEL = 2;
  const SPIRE_UPGRADE_COST = [120, 200]; // 0→1, 1→2
  const SPIRE_UPGRADE_BONUS = [
    { maxHp: 120, atk: 4, heal: 80 },
    { maxHp: 160, atk: 6, heal: 100 },
  ];
  const SPIRE_REPAIR_PCT = 0.35; // restore up to 35% max HP
  const SPIRE_REPAIR_COST_LIGHT = 60;  // when missing ≤ 40% max
  const SPIRE_REPAIR_COST_HEAVY = 120; // when missing > 40% max
  // Hero-kill level-ups (Round 1 AXP mock). Soft cap; modest permanent bumps.
  const AXIE_MAX_LEVEL = 10;
  const LEVEL_BONUS = { maxHp: 16, atk: 2, armor: 0.5 }; // per level after 1
  /** Baseline Pack ~90 HP / baseAtk / 55 speed at Den L0; species.stats are multipliers (armor absolute). */
  function packStatsForDen(den, baseAtk, speciesDef) {
    const lv = (den && den.level) || 0;
    const m = (speciesDef && speciesDef.stats) || { hp: 1, atk: 1, armor: 0, speed: 1 };
    const hpMul = m.hp != null ? m.hp : 1;
    const atkMul = m.atk != null ? m.atk : 1;
    const spdMul = m.speed != null ? m.speed : 1;
    const hp = Math.round((90 + lv * 32) * hpMul);
    const atk = Math.round(baseAtk * (1 + lv * 0.28) * atkMul);
    let gold = 12 + lv * 2;
    const armor = m.armor != null ? m.armor : 0;
    const speed = Math.round(55 * spdMul);
    if (speciesDef && speciesDef.trait && speciesDef.trait.effects && speciesDef.trait.effects.goldBonus) {
      gold = Math.round(gold * (1 + speciesDef.trait.effects.goldBonus));
    }
    return { hp, atk, gold, armor, speed };
  }

  function clamp(v, a, b) { return Math.max(a, Math.min(b, v)); }
  function dist(a, b) {
    const dx = a.x - b.x, dy = a.y - b.y;
    return Math.hypot(dx, dy);
  }
  /**
   * Forest collision = solid AABB strips between lanes, with rectangular gaps.
   * Decorative tree circles are drawn on the solid parts only.
   */
  function treesFromRects(rects) {
    const trees = [];
    const spacing = 40;
    for (const rect of rects) {
      for (let x = rect.x + 22; x < rect.x + rect.w - 16; x += spacing) {
        for (let row = 0; row < 3; row++) {
          const y = rect.y + 22 + row * 32;
          if (y > rect.y + rect.h - 16) continue;
          const jitter = ((Math.floor(x / spacing) + row) % 3 - 1) * 6;
          trees.push({ x: x + jitter * 0.3, y: y + jitter * 0.2, r: 16 + (row % 2) * 3 });
        }
      }
    }
    return trees;
  }

  function buildForest() {
    const bands = [
      { y: (LANE_Y.top + LANE_Y.mid) / 2 - 55, h: 110 }, // top↔mid
      { y: (LANE_Y.mid + LANE_Y.bot) / 2 - 55, h: 110 }, // mid↔bot
    ];
    const xMin = 180;
    const xMax = W - 180;
    const cuts = [xMin];
    for (const gx of FOREST_GAP_XS) {
      cuts.push(gx - FOREST_GAP_HALF, gx + FOREST_GAP_HALF);
    }
    cuts.push(xMax);
    const rects = [];
    for (const band of bands) {
      for (let i = 0; i + 1 < cuts.length; i += 2) {
        const x0 = cuts[i];
        const x1 = cuts[i + 1];
        if (x1 - x0 > 8) rects.push({ x: x0, y: band.y, w: x1 - x0, h: band.h });
      }
    }
    return { rects, trees: treesFromRects(rects) };
  }

  let FOREST_RECTS = [];
  let TREES = [];
  let ACTIVE_GAME_CONTRACT = null;

  /**
   * Apply Mappie *.game.json layout (lanes, bases, forest, gaps).
   * Falls back to built-in hardcodes when doc is missing/invalid.
   * @returns {boolean} true if contract applied
   */
  function applyGameContract(doc) {
    // Reset to defaults first so a partial doc cannot leave stale state
    LANE_Y = { top: 130, mid: 400, bot: 670 };
    LANE_PATH_W = 72;
    PLAYER_BASE_X = 90;
    ENEMY_BASE_X = 1410;
    SANCTUARY_R = 70;
    FOREST_GAP_XS = [420, 750, 1080];
    FOREST_GAP_HALF = 50;
    ACTIVE_GAME_CONTRACT = null;

    const ok = !!(doc && doc.schema_version === 1);
    if (ok) {
      ACTIVE_GAME_CONTRACT = doc;
      if (Array.isArray(doc.lanes) && doc.lanes.length) {
        const next = { top: LANE_Y.top, mid: LANE_Y.mid, bot: LANE_Y.bot };
        for (let i = 0; i < doc.lanes.length; i++) {
          const lane = doc.lanes[i];
          if (!lane || !lane.id) continue;
          if (typeof lane.y_px === 'number') next[lane.id] = lane.y_px;
          if (typeof lane.path_half_h_px === 'number') {
            LANE_PATH_W = lane.path_half_h_px * 2;
          }
        }
        LANE_Y = next;
      }
      if (doc.bases) {
        if (doc.bases.player) {
          if (typeof doc.bases.player.x_px === 'number') PLAYER_BASE_X = doc.bases.player.x_px;
          if (typeof doc.bases.player.sanctuary_r_px === 'number') {
            SANCTUARY_R = doc.bases.player.sanctuary_r_px;
          }
        }
        if (doc.bases.enemy && typeof doc.bases.enemy.x_px === 'number') {
          ENEMY_BASE_X = doc.bases.enemy.x_px;
        }
      }
      if (doc.forest) {
        if (Array.isArray(doc.forest.gaps) && doc.forest.gaps.length) {
          FOREST_GAP_XS = doc.forest.gaps.map((g) => g.x_px);
          if (typeof doc.forest.gaps[0].half_width_px === 'number') {
            FOREST_GAP_HALF = doc.forest.gaps[0].half_width_px;
          }
        }
        if (Array.isArray(doc.forest.rects) && doc.forest.rects.length) {
          FOREST_RECTS = doc.forest.rects.map((r) => ({
            x: r.x, y: r.y, w: r.w, h: r.h,
          }));
          TREES = treesFromRects(FOREST_RECTS);
          return true;
        }
      }
    }

    const built = buildForest();
    FOREST_RECTS = built.rects;
    TREES = built.trees;
    return ok;
  }

  applyGameContract(null);

  async function loadGameContract(url) {
    const src = url || GAME_CONTRACT_URL;
    try {
      const res = await fetch(src);
      if (!res.ok) throw new Error('HTTP ' + res.status);
      return await res.json();
    } catch (err) {
      console.warn('[LunaciaRift] game contract load failed — using hardcodes', src, err);
      return null;
    }
  }

  /** Circle vs AABB: push entity out of solid forest rects. */
  function resolveTreeCollision(ent) {
    const er = ent.r || 8;
    for (let pass = 0; pass < 2; pass++) {
      for (let i = 0; i < FOREST_RECTS.length; i++) {
        const r = FOREST_RECTS[i];
        const nearestX = clamp(ent.x, r.x, r.x + r.w);
        const nearestY = clamp(ent.y, r.y, r.y + r.h);
        let dx = ent.x - nearestX;
        let dy = ent.y - nearestY;
        // Center inside the rect — push via nearest edge
        if (dx === 0 && dy === 0) {
          const left = ent.x - r.x;
          const right = r.x + r.w - ent.x;
          const top = ent.y - r.y;
          const bot = r.y + r.h - ent.y;
          const m = Math.min(left, right, top, bot);
          if (m === left) ent.x = r.x - er;
          else if (m === right) ent.x = r.x + r.w + er;
          else if (m === top) ent.y = r.y - er;
          else ent.y = r.y + r.h + er;
          continue;
        }
        const d = Math.hypot(dx, dy);
        if (d < er) {
          const push = (er - d) / d;
          ent.x += dx * push;
          ent.y += dy * push;
        }
      }
    }
    ent.x = clamp(ent.x, er, W - er);
    ent.y = clamp(ent.y, er, H - er);
  }

  function moveToward(ent, tx, ty, speed, dt) {
    const dx = tx - ent.x, dy = ty - ent.y;
    const d = Math.hypot(dx, dy);
    if (d < 1) {
      resolveTreeCollision(ent);
      return;
    }
    const prevX = ent.x;
    const step = Math.min(d, speed * dt);
    ent.x += (dx / d) * step;
    ent.y += (dy / d) * step;
    resolveTreeCollision(ent);
    // Axie PNGs face left; flip when moving rightward.
    if (ent.facingRight !== undefined) {
      const movedX = ent.x - prevX;
      if (Math.abs(movedX) > 0.15) ent.facingRight = movedX > 0;
    }
  }

  /** Path Pack to Nest via nearest forest gap when leaving a side lane. */
  function moveTowardNest(p, nest, dt) {
    if (Math.abs(p.y - nest.y) <= 20) {
      moveToward(p, nest.x, nest.y, p.speed, dt);
      return;
    }
    let gapX = FOREST_GAP_XS[0];
    let best = Math.abs(p.x - gapX);
    for (let i = 1; i < FOREST_GAP_XS.length; i++) {
      const gx = FOREST_GAP_XS[i];
      const d = Math.abs(p.x - gx);
      if (d < best) { best = d; gapX = gx; }
    }
    if (Math.abs(p.x - gapX) > 12) {
      moveToward(p, gapX, p.y, p.speed, dt);
    } else if (Math.abs(p.y - nest.y) > 12) {
      moveToward(p, gapX, nest.y, p.speed, dt);
    } else {
      moveToward(p, nest.x, nest.y, p.speed, dt);
    }
  }
  /**
   * Class damage multiplier. Prefer triangle.advantages[attacker][defender].
   * Fallback: legacy strongVs/weakVs + modifier (±15% primary feel).
   */
  function classMult(attackerClass, defenderClass, triangle) {
    if (!attackerClass || !defenderClass || !triangle) return 1;
    const atk = String(attackerClass);
    const def = String(defenderClass);
    if (triangle.advantages && triangle.advantages[atk]) {
      const m = triangle.advantages[atk][def];
      if (typeof m === 'number') return m;
    }
    const info = triangle[atk];
    if (!info) return 1;
    const mod = triangle.modifier != null ? triangle.modifier : 0.15;
    if (info.strongVs === def) return 1 + mod;
    if (info.weakVs === def) return 1 - mod;
    if (Array.isArray(info.strongVs) && info.strongVs.indexOf(def) >= 0) return 1 + mod;
    if (Array.isArray(info.weakVs) && info.weakVs.indexOf(def) >= 0) return 1 - mod;
    return 1;
  }

  function properClassName(idOrName) {
    if (!idOrName) return null;
    const s = String(idOrName);
    if (s[0] === s[0].toUpperCase() && s.slice(1) === s.slice(1).toLowerCase()) return s;
    // plant → Plant
    return s.charAt(0).toUpperCase() + s.slice(1).toLowerCase();
  }

  function createGame(roster, canvas, ui, contract) {
    applyGameContract(contract || null);
    const ctx = canvas.getContext('2d');
    canvas.width = W;
    canvas.height = H;

    // Official CDN transparent PNGs (shared both teams). ~48px on canvas.
    // Starters (buba/olek/puffy) for heroes; packSpecies class ids for Den Packs.
    const SPRITE_DRAW_W = 48;
    const spriteCache = Object.create(null);
    // Canonical species defs (genes / traits / pack stats). packSpecies kept as alias.
    const packSpecies = (roster.species && roster.species.length)
      ? roster.species
      : ((roster.packSpecies && roster.packSpecies.length)
        ? roster.packSpecies
        : [
          { id: 'plant', name: 'Plant', color: '#3d9e4a', sprite: 'assets/axies/plant.png', stats: { hp: 1.25, atk: 0.85, armor: 4, speed: 0.85 } },
          { id: 'aquatic', name: 'Aquatic', color: '#2a7ec4', sprite: 'assets/axies/aquatic.png', stats: { hp: 0.9, atk: 1.1, armor: 1, speed: 1 } },
          { id: 'beast', name: 'Beast', color: '#c45a1a', sprite: 'assets/axies/beast.png', stats: { hp: 1, atk: 1.2, armor: 1, speed: 1.15 } },
          { id: 'bird', name: 'Bird', color: '#d45a8c', sprite: 'assets/axies/bird.png', stats: { hp: 0.7, atk: 1.25, armor: 0, speed: 1.35 } },
          { id: 'bug', name: 'Bug', color: '#c9a227', sprite: 'assets/axies/bug.png', stats: { hp: 0.95, atk: 1.12, armor: 1, speed: 1.05 } },
          { id: 'reptile', name: 'Reptile', color: '#7b4fc4', sprite: 'assets/axies/reptile.png', stats: { hp: 1.2, atk: 0.95, armor: 6, speed: 0.8 } },
          { id: 'dawn', name: 'Dawn', color: '#e8d48a', sprite: 'assets/axies/dawn.png', stats: { hp: 1, atk: 0.8, armor: 3, speed: 1 } },
          { id: 'dusk', name: 'Dusk', color: '#4a5a9e', sprite: 'assets/axies/dusk.png', stats: { hp: 1.05, atk: 1, armor: 3, speed: 1 } },
          { id: 'mech', name: 'Mech', color: '#8a9aa8', sprite: 'assets/axies/mech.png', stats: { hp: 1.2, atk: 1, armor: 8, speed: 0.75 } },
        ]);
    const species = packSpecies;
    const PACK_CLASS_IDS = packSpecies.map((s) => s.id);
    const packSpeciesById = Object.create(null);
    packSpecies.forEach((s) => { packSpeciesById[s.id] = s; });
    const starterClassMap = roster.starterClassMap || { buba: 'plant', olek: 'beast', puffy: 'aquatic' };
    function classIdForStarter(defId) {
      return starterClassMap[defId] || defId;
    }
    function packSpeciesDef(id) {
      return packSpeciesById[id] || null;
    }
    function speciesDef(id) {
      return packSpeciesDef(id);
    }
    function packSpeciesName(id) {
      const d = packSpeciesDef(id);
      if (d) return d.name;
      const st = (roster.starters || []).find((s) => s.id === id);
      return (st && st.name) || id || '?';
    }
    function packSpeciesColor(id) {
      const d = packSpeciesDef(id);
      if (d && d.color) return d.color;
      const st = (roster.starters || []).find((s) => s.id === id);
      return (st && st.color) || '#8fd4a0';
    }
    /** Normalize starter genes (alias parts → genes). */
    function genesOf(def) {
      if (!def) return null;
      return def.genes || def.parts || null;
    }
    /** Flatten gene + class-trait effect flags onto a unit. */
    function applyGeneTraitFlags(unit, genes, trait) {
      unit.lastHitBonus = 0;
      unit.sanctuaryRegenBonus = 0;
      unit.chaseSpeed = 0;
      unit.aggroRangeBonus = 0;
      unit.executeBonus = 0;
      unit.atkRangeGene = 0;
      unit.lifesteal = 0;
      unit.structureBonus = 0;
      unit.poisonDmgPct = 0;
      unit.packHealNearby = 0;
      unit.goldBonus = 0;
      // Prefer max when gene + class trait share a key (avoid double Aquatic execute, etc.)
      const absorb = (effects) => {
        if (!effects) return;
        const bump = (key, val) => {
          if (val == null) return;
          unit[key] = Math.max(unit[key] || 0, val);
        };
        if (effects.lastHitGold) bump('lastHitBonus', effects.lastHitGold);
        if (effects.sanctuaryRegen) bump('sanctuaryRegenBonus', effects.sanctuaryRegen);
        if (effects.chaseSpeed) bump('chaseSpeed', effects.chaseSpeed);
        if (effects.aggroRange) bump('aggroRangeBonus', effects.aggroRange);
        if (effects.executeBonus) bump('executeBonus', effects.executeBonus);
        if (effects.atkRange) bump('atkRangeGene', effects.atkRange);
        if (effects.lifesteal) bump('lifesteal', effects.lifesteal);
        if (effects.structureBonus) bump('structureBonus', effects.structureBonus);
        if (effects.poisonDmgPct) bump('poisonDmgPct', effects.poisonDmgPct);
        if (effects.packHealNearby) bump('packHealNearby', effects.packHealNearby);
        if (effects.goldBonus) bump('goldBonus', effects.goldBonus);
      };
      if (genes) {
        ['eyes', 'ears', 'mouth', 'horn', 'back', 'tail'].forEach((slot) => {
          if (genes[slot] && genes[slot].effects) absorb(genes[slot].effects);
        });
      }
      if (trait && trait.effects) absorb(trait.effects);
      unit.trait = trait || null;
      unit.genes = genes || null;
      unit.parts = genes || unit.parts || null; // UI compat alias
    }
    function loadSprite(id, src) {
      if (!id || !src || spriteCache[id]) return;
      const img = new Image();
      img.src = src;
      spriteCache[id] = img;
    }
    (roster.starters || []).forEach((s) => {
      if (s.sprite && s.id) loadSprite(s.id, s.sprite);
    });
    packSpecies.forEach((s) => {
      if (s.sprite && s.id) loadSprite(s.id, s.sprite);
    });
    // Primary: Aseprite-Mappie Tiled tilemap (baked offscreen). Optional painted plate if Tiled fails.
    const mapImage = new Image();
    mapImage.src = 'assets/map/lunacia_rift.png';
    function tilemapReady() {
      const tm = global.LunaciaTilemap;
      return !!(tm && typeof tm.isReady === 'function' && tm.isReady());
    }
    function mapReady() {
      return !!(mapImage && mapImage.complete && mapImage.naturalWidth > 0);
    }
    function spriteReady(defId) {
      const img = spriteCache[defId];
      return !!(img && img.complete && img.naturalWidth > 0);
    }
    function spriteDrawSize(defId, drawW) {
      const img = spriteCache[defId];
      const targetW = drawW || SPRITE_DRAW_W;
      if (!spriteReady(defId)) return { w: targetW, h: targetW };
      const w = targetW;
      const h = Math.round(w * (img.naturalHeight / img.naturalWidth));
      return { w, h };
    }
    const PACK_SPRITE_W = 30;

    const ZOOM_IN = 2.7;
    const ZOOM_OUT = 1.0;
    const CAM_FOLLOW = 6; // lerp rate toward focus
    const ZOOM_LERP = 8;
    const CORPSE_CAM_SEC = 0.85;
    // Fog of War (Round 1): player-centric vision radii in world px
    const FOG_ALPHA = 0.72;
    const FOG_VISION_AXIE = 260;
    const FOG_VISION_PACK = 130;
    const FOG_VISION_SPIRE = 150;
    const FOG_VISION_DEN = 140;
    const FOG_VISION_NEST = 180;

    const state = {
      running: false,
      ended: false,
      winner: null,
      t: 0,
      packTimer: 2,
      gold: 200,
      enemyGold: 190,
      log: [],
      selectedIdx: 0,
      channel: null, // { axie, lane, t, dur }
      shop: roster.shop.slice(),
      triangle: roster.classTriangle,
      structures: [],
      packs: [],
      axies: [],
      projectiles: [],
      fx: [],
      keys: Object.create(null),
      // Camera: soft-follow selected Axie; hold Shift / HUD to zoom out
      zoomOutHeld: false,
      cam: { x: W / 2, y: H / 2, zoom: ZOOM_IN },
      camCorpseUntil: 0,
      camCorpsePos: null,
    };

    function log(msg) {
      state.log.unshift(`[${fmtTime(state.t)}] ${msg}`);
      if (state.log.length > 40) state.log.pop();
      if (ui.renderLog) ui.renderLog(state.log);
    }

    function fmtTime(t) {
      const m = Math.floor(t / 60);
      const s = Math.floor(t % 60);
      return `${m}:${String(s).padStart(2, '0')}`;
    }

    // --- Structures: 12 Spires + 6 Dens + 2 Nests ---
    function addSpire(team, lane, tier, x, y) {
      const maxHp = tier === 2 ? 780 : 580;
      const atkDamage = tier === 2 ? 18 : 13;
      state.structures.push({
        type: 'spire',
        team,
        lane,
        tier, // 1 outer, 2 inner
        x, y,
        r: tier === 2 ? 26 : 22,
        maxHp,
        hp: maxHp,
        goldReward: tier === 2 ? 130 : 100,
        alive: true,
        level: 0, // 0..SPIRE_MAX_LEVEL — fortify upgrades
        atkRange: 140,
        atkCd: 0,
        atkDamage,
      });
    }
    function addDen(team, lane, x, y) {
      // Spawn-only building: HP + destroy effects, no attacks. level upgrades Packs.
      state.structures.push({
        type: 'den',
        team,
        lane,
        x, y,
        r: 20,
        maxHp: 680,
        hp: 680,
        goldReward: 90,
        alive: true,
        level: 0, // 0..DEN_MAX_LEVEL — dies with the Den
        speciesId: null, // plant|aquatic|beast|bird|bug|reptile|dawn|dusk|mech — Pack class (bred; not auto-synced to lane Axie)
        atkRange: 0,
        atkCd: 0,
        atkDamage: 0,
      });
    }
    function addNest(team, x, y) {
      state.structures.push({
        type: 'nest',
        team,
        x, y,
        r: 36,
        maxHp: 1600,
        hp: 1600,
        alive: true,
        unlocked: false,
        atkRange: 160,
        atkCd: 0,
        atkDamage: 32,
      });
    }

    // Player left, enemy right. Prefer Mappie *.game.json structures; else hardcode.
    // Order of push: T1 → T2 → Den → Nest.
    const contractStructs = ACTIVE_GAME_CONTRACT && Array.isArray(ACTIVE_GAME_CONTRACT.structures)
      ? ACTIVE_GAME_CONTRACT.structures
      : null;
    if (contractStructs && contractStructs.length) {
      for (let i = 0; i < contractStructs.length; i++) {
        const s = contractStructs[i];
        if (!s || !s.type) continue;
        if (s.type === 'spire') addSpire(s.team, s.lane, s.tier || 1, s.x, s.y);
        else if (s.type === 'den') addDen(s.team, s.lane, s.x, s.y);
        else if (s.type === 'nest') addNest(s.team, s.x, s.y);
      }
    } else {
      LANES.forEach((lane) => {
        const y = LANE_Y[lane];
        addSpire('player', lane, 1, 440, y);
        addSpire('player', lane, 2, 250, y);
        addDen('player', lane, PLAYER_BASE_X + 50, y);
        addSpire('enemy', lane, 1, 1060, y);
        addSpire('enemy', lane, 2, 1250, y);
        addDen('enemy', lane, ENEMY_BASE_X - 50, y);
      });
      addNest('player', PLAYER_BASE_X, H / 2);
      addNest('enemy', ENEMY_BASE_X, H / 2);
    }

    function makeAxie(def, team, lane, idx) {
      const y = LANE_Y[lane];
      const x = team === 'player' ? PLAYER_BASE_X + 40 : ENEMY_BASE_X - 40;
      const genes = genesOf(def);
      const sid = def.speciesId || classIdForStarter(def.id);
      const sp = speciesDef(sid);
      const trait = (sp && sp.trait) || null;
      const axie = {
        id: `${team}-${def.id}`,
        defId: def.id,
        name: def.name,
        class: def.class || properClassName(sid),
        speciesId: sid,
        role: def.role,
        color: def.color,
        sprite: def.sprite || null,
        team,
        lane,
        slot: idx,
        level: 1, // hero-kill AXP mock; persists through death/respawn
        x, y,
        r: 16,
        maxHp: team === 'player' ? Math.round(def.stats.hp * 1.10) : def.stats.hp,
        hp: team === 'player' ? Math.round(def.stats.hp * 1.10) : def.stats.hp,
        atk: def.stats.atk,
        armor: team === 'player' ? def.stats.armor + 2 : def.stats.armor,
        baseSpeed: def.stats.speed,
        speed: def.stats.speed,
        atkRange: def.stats.atkRange,
        atkCooldown: def.stats.atkCooldown,
        atkCd: 0,
        targetX: x,
        targetY: y,
        // Art faces left; player starts facing right (toward enemy), enemy faces left.
        facingRight: team === 'player',
        controlled: false,
        alive: true,
        respawnAt: 0,
        items: { boots: false, vial: false, relic: false },
        skills: {
          Q: { cd: 0, max: 4.5, name: (genes && genes.mouth && genes.mouth.name) || 'Q' },
          W: { cd: 0, max: 6.5, name: (genes && genes.horn && genes.horn.name) || 'W' },
          E: { cd: 0, max: 8, name: (genes && genes.back && genes.back.name) || 'E' },
          R: { cd: 0, max: 12, name: (genes && genes.tail && genes.tail.name) || 'R' },
        },
        buffs: {
          haste: 0,
          shield: 0,
          shieldDur: 0,
          slowTag: 0,
          msBuff: 0,
          veil: 0,
          armorShred: 0,
          shredAmt: 0,
        },
        aiState: 'lane',
      };
      applyGeneTraitFlags(axie, genes, trait);
      axie.atkRange = def.stats.atkRange + (axie.atkRangeGene || 0);
      return axie;
    }

    const starters = roster.starters;
    LANES.forEach((lane, i) => {
      const def = starters[i];
      const p = makeAxie(def, 'player', lane, i);
      const e = makeAxie(def, 'enemy', lane, i);
      state.axies.push(p, e);
    });
    state.axies.filter((a) => a.team === 'player')[0].controlled = true;

    // Default Den Pack class = lane Axie's class id (starters map buba→plant, olek→beast, puffy→aquatic)
    state.structures.filter((s) => s.type === 'den').forEach((den) => {
      const ax = state.axies.find((a) => a.team === den.team && a.lane === den.lane);
      den.speciesId = ax ? classIdForStarter(ax.defId) : 'plant';
    });

    function playerAxies() { return state.axies.filter((a) => a.team === 'player'); }
    function selected() { return playerAxies()[state.selectedIdx]; }

    function nestFor(team) {
      return state.structures.find((s) => s.type === 'nest' && s.team === team);
    }
    function spiresFor(team) {
      return state.structures.filter((s) => s.type === 'spire' && s.team === team && s.alive);
    }
    function denFor(team, lane) {
      return state.structures.find((s) => s.type === 'den' && s.team === team && s.lane === lane);
    }
    function denAlive(team, lane) {
      const d = denFor(team, lane);
      return !!(d && d.alive);
    }
    function retargetPacksAfterDenFall(den) {
      // Opponent Packs on this lane super-push toward the Nest
      const foeTeam = den.team === 'player' ? 'enemy' : 'player';
      for (const p of living(state.packs)) {
        if (p.team === foeTeam && p.lane === den.lane) p.superPush = true;
      }
    }
    function updateNestUnlock(team) {
      const nest = nestFor(team);
      if (!nest || nest.unlocked) return;
      const t2Down = state.structures.filter(
        (s) => s.type === 'spire' && s.team === team && s.tier === 2 && !s.alive
      ).length;
      if (t2Down >= NEST_UNLOCK_T2) {
        nest.unlocked = true;
        log(`${team === 'player' ? 'Your' : 'Enemy'} Nest is exposed! (${t2Down} inner Spires down)`);
      }
    }

    function spawnPackWave() {
      let spawnedAny = false;
      LANES.forEach((lane) => {
        const y = LANE_Y[lane];
        const teams = [
          {
            team: 'player',
            baseX: PLAYER_BASE_X + 90,
            dir: 1,
            atk: 12,
          },
          {
            team: 'enemy',
            baseX: ENEMY_BASE_X - 90,
            dir: -1,
            atk: 9,
          },
        ];
        for (const side of teams) {
          const den = denFor(side.team, lane);
          if (!den || !den.alive) continue;
          const foeTeam = side.team === 'player' ? 'enemy' : 'player';
          const superPush = !denAlive(foeTeam, lane);
          const siegeNest = !state.structures.some(
            (s) => s.alive && s.team === foeTeam && s.type === 'spire' && s.lane === lane
          );
          const sid = den.speciesId || 'plant';
          const spDef = packSpeciesDef(sid);
          const stats = packStatsForDen(den, side.atk, spDef);
          spawnedAny = true;
          for (let i = 0; i < 3; i++) {
            const pack = {
              team: side.team,
              lane,
              x: side.baseX + side.dir * i * 18,
              y: y + (i - 1) * 8,
              r: 8,
              hp: stats.hp,
              maxHp: stats.hp,
              atk: stats.atk,
              armor: stats.armor || 0,
              speed: stats.speed || 55,
              atkRange: 28,
              atkCd: 0,
              gold: stats.gold,
              alive: true,
              isMelee: true,
              superPush,
              siegeNest,
              denLevel: den.level,
              speciesId: sid,
              class: properClassName((spDef && spDef.name) || sid),
              facingRight: side.team === 'player',
            };
            applyGeneTraitFlags(pack, spDef && spDef.genes, spDef && spDef.trait);
            // Pack atkRange gene bump (aquatic fin ears etc.)
            if (pack.atkRangeGene) pack.atkRange += pack.atkRangeGene;
            state.packs.push(pack);
          }
        }
      });
      if (spawnedAny) log('Packs marched from Sanctuaries.');
    }

    function living(list) { return list.filter((u) => u.alive); }

    function enemiesOf(unit) {
      const foeTeam = unit.team === 'player' ? 'enemy' : 'player';
      const heroes = living(state.axies).filter((a) => a.team === foeTeam);
      const packs = living(state.packs).filter((p) => p.team === foeTeam);
      const structs = state.structures.filter((s) => {
        if (!s.alive || s.team !== foeTeam) return false;
        if (s.type === 'nest' && !s.unlocked) return false;
        // Must clear outer before hitting inner on same lane (soft rule for packs/AI)
        return true;
      });
      return [...heroes, ...packs, ...structs];
    }

    function nearest(unit, list, maxR) {
      let best = null, bestD = maxR != null ? maxR : Infinity;
      for (const o of list) {
        const d = dist(unit, o);
        if (d < bestD) { bestD = d; best = o; }
      }
      return best;
    }

    function dealDamage(attacker, target, raw, opts) {
      if (!target.alive) return 0;
      opts = opts || {};
      let dmg = raw;
      const atkClass = attacker.class || properClassName(attacker.speciesId);
      const defClass = target.class || properClassName(target.speciesId);
      if (atkClass && defClass) {
        dmg *= classMult(atkClass, defClass, state.triangle);
      }
      // Gene / trait execute (Aquatic eyes, Pack Torrent, etc.)
      const hpPct = target.maxHp > 0 ? target.hp / target.maxHp : 1;
      if (attacker.executeBonus && hpPct < 0.4) dmg *= (1 + attacker.executeBonus);
      // Bug Venom: extra % vs low HP
      if (attacker.poisonDmgPct && hpPct < 0.4) dmg *= (1 + attacker.poisonDmgPct);
      // Mech Siege Plating vs structures
      if (attacker.structureBonus && (target.type === 'spire' || target.type === 'nest' || target.type === 'den')) {
        dmg *= (1 + attacker.structureBonus);
      }
      // Tidal Finish execute bonus (heroes/packs; soft vs Nest)
      if (opts.execute && hpPct < 0.4) {
        dmg *= target.type === 'nest' ? 1.15 : 1.55;
      }
      if (opts.skill && target.type === 'nest') dmg *= 0.55;
      let armor = target.armor || 0;
      if (target.buffs && target.buffs.armorShred > 0) {
        armor = Math.max(0, armor - (target.buffs.shredAmt || 5));
      }
      dmg = Math.max(1, dmg - armor * 0.5);
      if (target.buffs && target.buffs.veil > 0) dmg *= 0.7;
      if (target.buffs && target.buffs.shield > 0) {
        const absorb = Math.min(target.buffs.shield, dmg);
        target.buffs.shield -= absorb;
        dmg -= absorb;
      }
      target.hp -= dmg;
      // Dusk Drain lifesteal (tiny on hit)
      if (attacker.lifesteal && attacker.hp != null && attacker.maxHp != null && attacker.alive !== false) {
        const heal = dmg * attacker.lifesteal;
        attacker.hp = Math.min(attacker.maxHp, attacker.hp + heal);
      }
      state.fx.push({ x: target.x, y: target.y - 20, text: Math.round(dmg), life: 0.6, color: '#ffb4b4' });
      if (target.hp <= 0) {
        target.hp = 0;
        target.alive = false;
        onKill(attacker, target);
      }
      return dmg;
    }

    function onKill(attacker, target) {
      if (target.gold != null) {
        // Pack last-hit
        const isPlayerKill = attacker.team === 'player' || (attacker.ownerTeam === 'player');
        const killerTeam = attacker.team || attacker.ownerTeam;
        let g = target.gold;
        let goldMul = 1;
        if (attacker.lastHitBonus) goldMul += attacker.lastHitBonus;
        if (attacker.goldBonus) goldMul += attacker.goldBonus;
        if (goldMul !== 1) g = Math.round(g * goldMul);
        if (killerTeam === 'player') {
          state.gold += g;
          log(`Last-hit Pack +${g}g`);
          if (ui.renderShop) ui.renderShop(state);
        } else {
          state.enemyGold += g;
        }
      }
      if (target.type === 'spire') {
        const g = target.goldReward;
        if (attacker.team === 'player') {
          state.gold += g;
          log(`Spire destroyed! +${g}g (${target.lane} T${target.tier})`);
          if (ui.renderShop) ui.renderShop(state);
        } else {
          state.enemyGold += g;
          log(`Your Spire fell (${target.lane} T${target.tier})`);
        }
        updateNestUnlock(target.team);
      }
      if (target.type === 'den') {
        const g = target.goldReward;
        target.level = 0; // upgrades die with the Den
        if (attacker.team === 'player') {
          state.gold += g;
          log(`Den destroyed! +${g}g (${target.lane})`);
          if (ui.renderShop) ui.renderShop(state);
        } else {
          state.enemyGold += g;
          log(`Your Den fell (${target.lane})`);
        }
        retargetPacksAfterDenFall(target);
        if (ui.renderDens) ui.renderDens(state);
      }
      if (target.type === 'nest') {
        state.ended = true;
        state.running = false;
        state.winner = attacker.team === 'player' ? 'player' : 'enemy';
        log(state.winner === 'player' ? 'Victory! Enemy Nest shattered.' : 'Defeat — your Nest fell.');
        if (ui.showEnd) ui.showEnd(state.winner);
      }
      if (target.slot != null && target.defId) {
        // hero death — Axie-on-Axie killing blow levels the killer (not packs/structures)
        tryHeroLevelUp(attacker);
        target.respawnAt = state.t + 8;
        log(`${target.name} (${target.team}) down — respawn 8s`);
        if (target.team === 'player' && target.controlled) {
          const corpse = { x: target.x, y: target.y };
          const pals = playerAxies();
          const alt = pals.find((a) => a.alive && a !== target);
          if (alt) selectAxie(alt.slot);
          // Linger on corpse after swap so camera doesn't snap instantly
          state.camCorpsePos = corpse;
          state.camCorpseUntil = state.t + CORPSE_CAM_SEC;
        }
      }
    }

    /** Round 1 AXP mock: hero killer gains a soft-capped level + modest permanent stats. */
    function tryHeroLevelUp(attacker) {
      if (!attacker || !attacker.defId || attacker.slot == null || !attacker.team) return;
      if (attacker.level == null) attacker.level = 1;
      if (attacker.level >= AXIE_MAX_LEVEL) return;
      attacker.level += 1;
      attacker.atk += LEVEL_BONUS.atk;
      attacker.armor += LEVEL_BONUS.armor;
      applyItemStats(attacker); // refreshes maxHp from level; heals the gained max
      log(`${attacker.name} leveled up! (Lv ${attacker.level})`);
      state.fx.push({
        x: attacker.x,
        y: attacker.y - 28,
        text: 'Lv Up',
        life: 1.0,
        color: '#ffe66d',
      });
      if (ui.renderAxies) ui.renderAxies(state);
      if (ui.renderHud) ui.renderHud(state);
    }

    function tryAttack(unit, dt) {
      unit.atkCd = Math.max(0, unit.atkCd - dt);
      const foes = enemiesOf(unit);
      // Priority: heroes > last-hittable packs > structures > other packs
      let target = null;
      const inRange = foes.filter((f) => dist(unit, f) <= unit.atkRange + (f.r || 8));
      if (!inRange.length) return null;
      const heroes = inRange.filter((f) => f.defId);
      const packs = inRange.filter((f) => f.gold != null && f.type !== 'spire' && f.type !== 'nest' && f.type !== 'den');
      const structs = inRange.filter((f) => f.type === 'spire' || f.type === 'nest' || f.type === 'den');
      const lastHittable = packs.filter((p) => p.hp / p.maxHp < 0.4);
      const otherPacks = packs.filter((p) => p.hp / p.maxHp >= 0.4);
      target =
        nearest(unit, heroes) ||
        nearest(unit, lastHittable) ||
        nearest(unit, structs) ||
        nearest(unit, otherPacks);
      if (!target || unit.atkCd > 0) return target;

      let cd = unit.atkCooldown;
      if (unit.items && unit.items.relic) cd *= (1 - 0.18);
      if (unit.buffs && unit.buffs.haste > 0) cd *= 0.85;
      unit.atkCd = cd;

      // Weak last-hit for AI allies: slightly less damage to packs
      let dmg = unit.atk;
      if (unit.aiWeakLastHit && target.gold != null) dmg *= 0.55;

      // Visual basic bolt (damage applies on projectile hit)
      const ranged = (unit.atkRange || 0) >= 90 || unit.defId === 'puffy';
      fireBasicBolt(unit, target, dmg, {
        speed: ranged ? 480 : 620,
        r: ranged ? 5.5 : 4.5,
        glow: ranged ? 13 : 10,
        kind: unit.defId === 'puffy' ? 'bubble' : 'bolt',
      });
      return target;
    }

    function sanctuaryPos(team) {
      return { x: team === 'player' ? PLAYER_BASE_X : ENEMY_BASE_X, y: H / 2 };
    }

    function inSanctuary(axie) {
      const s = sanctuaryPos(axie.team);
      return dist(axie, s) <= SANCTUARY_R + 10;
    }

    function updateHeroAI(axie, dt) {
      if (!axie.alive) return;
      // Retreat under 30% toward Sanctuary
      if (axie.hp / axie.maxHp < 0.3) {
        axie.aiState = 'retreat';
        const s = sanctuaryPos(axie.team);
        axie.targetX = s.x;
        axie.targetY = s.y;
        moveToward(axie, axie.targetX, axie.targetY, moveSpeed(axie), dt);
        if (inSanctuary(axie)) {
          axie.hp = Math.min(axie.maxHp, axie.hp + 40 * dt);
        }
        tryAttack(axie, dt);
        return;
      }
      axie.aiState = 'lane';
      const y = LANE_Y[axie.lane];
      // Prefer fight enemy hero nearby, else last-hit packs weakly, else hit Spire
      const aggroR = 220 + (axie.aggroRangeBonus || 0);
      const foeHeroes = living(state.axies).filter(
        (a) => a.team !== axie.team && a.lane === axie.lane && dist(axie, a) < aggroR
      );
      if (foeHeroes.length) {
        const t = foeHeroes[0];
        if (dist(axie, t) > axie.atkRange - 5) {
          moveToward(axie, t.x, t.y, moveSpeed(axie), dt);
        }
        axie.aiWeakLastHit = false;
        tryAttack(axie, dt);
        return;
      }
      const packs = living(state.packs).filter(
        (p) => p.team !== axie.team && Math.abs(p.y - y) < 60
      );
      const lowPack = packs.sort((a, b) => a.hp - b.hp)[0];
      if (lowPack && lowPack.hp < 50) {
        axie.aiWeakLastHit = true;
        if (dist(axie, lowPack) > axie.atkRange - 5) {
          moveToward(axie, lowPack.x, lowPack.y, moveSpeed(axie) * 0.9, dt);
        }
        tryAttack(axie, dt);
        return;
      }
      // Push structures on lane: T1 → T2 → Den → Nest (if unlocked)
      const enemyTeam = axie.team === 'player' ? 'enemy' : 'player';
      let spire = state.structures.find(
        (s) => s.type === 'spire' && s.team === enemyTeam && s.lane === axie.lane && s.alive && s.tier === 1
      );
      if (!spire) {
        spire = state.structures.find(
          (s) => s.type === 'spire' && s.team === enemyTeam && s.lane === axie.lane && s.alive && s.tier === 2
        );
      }
      const den = denFor(enemyTeam, axie.lane);
      const nest = nestFor(enemyTeam);
      let push = spire;
      if (!push && den && den.alive) push = den;
      if (!push && nest && nest.unlocked && nest.alive) push = nest;
      if (push) {
        axie.aiWeakLastHit = false;
        if (dist(axie, push) > axie.atkRange - 8) {
          moveToward(axie, push.x, y, moveSpeed(axie), dt);
        } else {
          axie.y += (y - axie.y) * Math.min(1, 3 * dt);
        }
        tryAttack(axie, dt);
        return;
      }
      // Hold lane center-ish
      const holdX = axie.team === 'player' ? 560 : 940;
      moveToward(axie, holdX, y, moveSpeed(axie) * 0.6, dt);
      tryAttack(axie, dt);
    }

    function updateControlled(axie, dt) {
      if (!axie.alive) return;
      if (state.channel && state.channel.axie === axie) {
        // rooted while channeling lane reassign
        return;
      }
      moveToward(axie, axie.targetX, axie.targetY, moveSpeed(axie), dt);
      if (inSanctuary(axie)) {
        let regen = 25 + (axie.sanctuaryRegenBonus || 0);
        axie.hp = Math.min(axie.maxHp, axie.hp + regen * dt);
      }
      tryAttack(axie, dt);
    }

    function updatePack(p, dt) {
      if (!p.alive) return;
      if (p._baseSpeed == null) p._baseSpeed = p.speed;
      if (p._slowT > 0) p._slowT = Math.max(0, p._slowT - dt);
      p.speed = p._baseSpeed * (p._slowT > 0 ? 0.55 : 1);
      p.atkCd = Math.max(0, p.atkCd - dt);
      // Dawn Blessing: gently heal nearby ally Packs
      if (p.packHealNearby > 0) {
        for (const ally of living(state.packs)) {
          if (ally.team !== p.team || ally === p) continue;
          if (dist(p, ally) <= 70) {
            ally.hp = Math.min(ally.maxHp, ally.hp + p.packHealNearby * dt);
          }
        }
      }
      const y = LANE_Y[p.lane];
      const foeTeam = p.team === 'player' ? 'enemy' : 'player';
      // Foe Den down → super-creep; no alive T1/T2 on this lane → Nest siege
      if (!denAlive(foeTeam, p.lane)) p.superPush = true;
      const t1 = state.structures.find(
        (s) => s.alive && s.team === foeTeam && s.type === 'spire' && s.lane === p.lane && s.tier === 1
      );
      const t2 = state.structures.find(
        (s) => s.alive && s.team === foeTeam && s.type === 'spire' && s.lane === p.lane && s.tier === 2
      );
      if (!t1 && !t2) p.siegeNest = true;
      const sieging = !!(p.siegeNest || p.superPush);

      // Soft-snap to lane Y only while still clearing lane structures (not sieging Nest)
      if (!sieging) {
        p.y += (y - p.y) * Math.min(1, 2 * dt);
      }

      // Fight nearby enemy packs / heroes
      const foes = [
        ...living(state.packs).filter((o) => o.team === foeTeam && o.lane === p.lane),
        ...living(state.axies).filter((a) => a.team === foeTeam && dist(p, a) < 100),
      ];
      const nest = nestFor(foeTeam);
      let struct = null;
      if (sieging) {
        // Nest unlocked → damage Nest; Nest locked → Den if alive, else path to Nest & wait
        if (nest && nest.unlocked && nest.alive) {
          struct = nest;
        } else {
          const den = denFor(foeTeam, p.lane);
          if (den && den.alive) struct = den;
        }
      } else {
        // Structure order: T1 → T2 → Den → Nest (Nest only if unlocked for damage)
        struct = t1 || t2 || null;
        if (!struct) {
          const den = denFor(foeTeam, p.lane);
          if (den && den.alive) struct = den;
        }
        if (!struct && nest && nest.unlocked && nest.alive) struct = nest;
      }

      let target = nearest(p, foes, 80);
      if (!target && struct) target = struct;

      if (target) {
        if (dist(p, target) > p.atkRange) {
          if (sieging && target === nest) {
            moveTowardNest(p, nest, dt);
          } else {
            moveToward(p, target.x, target.y, p.speed, dt);
          }
        } else if (p.atkCd <= 0) {
          p.atkCd = 1.0;
          fireBasicBolt(p, target, p.atk, { speed: 400, r: 4, glow: 9, yOff: 2 });
        }
      } else if (sieging && nest && nest.alive) {
        // Nest still locked / no Den: path to Nest position and sit (no damage until unlocked)
        if (dist(p, nest) > Math.max(p.atkRange, nest.r + 4)) {
          moveTowardNest(p, nest, dt);
        }
      } else {
        const dir = p.team === 'player' ? 1 : -1;
        p.x += dir * p.speed * dt;
        resolveTreeCollision(p);
      }
      // Keep packs from drifting into trees after lane snap / fights
      resolveTreeCollision(p);
      // Despawn if past map
      if (p.x < -40 || p.x > W + 40) p.alive = false;
    }

    function updateStructures(dt) {
      for (const s of state.structures) {
        if (!s.alive) continue;
        if (!s.atkDamage) continue; // Dens are spawn-only
        s.atkCd = Math.max(0, s.atkCd - dt);
        const foes = living(state.axies).filter((a) => a.team !== s.team && dist(s, a) <= s.atkRange);
        const packs = living(state.packs).filter((p) => p.team !== s.team && dist(s, p) <= s.atkRange);
        const t = foes[0] || packs[0];
        if (t && s.atkCd <= 0) {
          s.atkCd = 1.1;
          // Spire/Nest bolt — owner is the structure (team used for foe filter)
          fireBasicBolt(s, t, s.atkDamage, {
            speed: 460,
            r: s.type === 'nest' ? 7 : 5.5,
            glow: 14,
            yOff: 0,
            color: basicBoltColor(s),
          });
        }
      }
    }

    function updateBuffs(axie, dt) {
      if (!axie.buffs) return;
      const b = axie.buffs;
      if (b.haste > 0) b.haste = Math.max(0, b.haste - dt);
      if (b.msBuff > 0) b.msBuff = Math.max(0, b.msBuff - dt);
      if (b.slowTag > 0) b.slowTag = Math.max(0, b.slowTag - dt);
      if (b.veil > 0) b.veil = Math.max(0, b.veil - dt);
      if (b.armorShred > 0) {
        b.armorShred = Math.max(0, b.armorShred - dt);
        if (b.armorShred <= 0) b.shredAmt = 0;
      }
      if (b.shieldDur > 0) {
        b.shieldDur = Math.max(0, b.shieldDur - dt);
        if (b.shieldDur <= 0) b.shield = 0;
      }
      axie._speedMul = 1;
      if (b.slowTag > 0) axie._speedMul *= 0.55;
      if (b.msBuff > 0) axie._speedMul *= 1.4;
      for (const k of Object.keys(axie.skills)) {
        axie.skills[k].cd = Math.max(0, axie.skills[k].cd - dt);
      }
    }

    function moveSpeed(axie) {
      let mul = axie._speedMul || 1;
      // Predator Eyes / chaseSpeed: +% when moving toward nearest living foe
      if (axie.chaseSpeed && axie.alive) {
        const foes = living(state.axies).filter((a) => a.team !== axie.team)
          .concat(living(state.packs).filter((p) => p.team !== axie.team));
        const near = nearest(axie, foes, 280);
        if (near) {
          const dx = near.x - axie.x;
          const movingToward = axie.facingRight ? dx > 8 : dx < -8;
          const closing = dist(axie, near) < 260;
          if (movingToward && closing) mul *= (1 + axie.chaseSpeed);
        }
      }
      return axie.speed * mul;
    }

    function applySlow(target, dur) {
      if (!target) return;
      if (target.buffs) target.buffs.slowTag = Math.max(target.buffs.slowTag || 0, dur);
      else target._slowT = Math.max(target._slowT || 0, dur);
    }

    function inFrontArc(origin, target, facingRight, range, halfWidth) {
      if (dist(origin, target) > range) return false;
      const dx = target.x - origin.x;
      const dy = target.y - origin.y;
      // Facing axis: +x or -x; keep targets roughly in forward half-plane + lateral width
      const forward = facingRight ? dx : -dx;
      if (forward < -8) return false;
      return Math.abs(dy) <= halfWidth + Math.max(0, forward) * 0.35;
    }

    function pushRing(x, y, r, color, life, opts) {
      const o = opts || {};
      const maxLife = life || 0.45;
      state.fx.push({
        x, y,
        r: r || 40,
        r0: o.r0 != null ? o.r0 : (o.shock ? 8 : Math.max(6, (r || 40) * 0.35)),
        ring: true,
        fill: o.fill !== false,
        shock: !!o.shock,
        arc: o.arc || null, // { facingRight, halfRad } radians half-width; null = full circle
        color: color || '#9ef0c0',
        life: maxLife,
        maxLife,
        lineW: o.lineW || 2.5,
        text: '',
      });
    }

    function spawnImpact(x, y, color, scale) {
      const s = scale || 1;
      pushRing(x, y, 22 * s, color || '#fff', 0.28, { shock: true, fill: true, lineW: 2 });
      for (let i = 0; i < 6; i++) {
        const ang = (Math.PI * 2 * i) / 6 + Math.random() * 0.4;
        const spd = 40 + Math.random() * 50;
        state.fx.push({
          x, y,
          vx: Math.cos(ang) * spd,
          vy: Math.sin(ang) * spd,
          spark: true,
          r: 2.2 + Math.random() * 1.6,
          color: color || '#9ad8ff',
          life: 0.28 + Math.random() * 0.18,
          maxLife: 0.4,
          text: '',
        });
      }
    }

    function spawnProjectile(opts) {
      const p = {
        x: opts.x,
        y: opts.y,
        vx: opts.vx,
        vy: opts.vy,
        r: opts.r != null ? opts.r : 8,
        dmg: opts.dmg,
        team: opts.team,
        owner: opts.owner,
        life: opts.life != null ? opts.life : 1.15,
        color: opts.color || '#7ec8ff',
        skill: !!opts.skill,
        kind: opts.kind || 'bolt', // bolt | bubble
        trail: [],
        trailAcc: 0,
        glow: opts.glow != null ? opts.glow : 14,
      };
      state.projectiles.push(p);
      return p;
    }

    /** Basic-attack bolt: aim at target, damage on hit. Snappy travel for melee ranges. */
    function basicBoltColor(unit) {
      if (!unit) return '#e8eef5';
      if (unit.defId === 'buba') return '#7dcf7a';
      if (unit.defId === 'olek') return '#ff9a5a';
      if (unit.defId === 'puffy') return '#7ec8ff';
      if (unit.type === 'spire') return '#e8c46a';
      if (unit.type === 'nest') return '#ff8a6a';
      if (unit.gold != null) return unit.team === 'player' ? '#c8e080' : '#e09090';
      return unit.team === 'player' ? '#9ad8ff' : '#ffb0a0';
    }

    function fireBasicBolt(owner, target, dmg, opts) {
      const o = opts || {};
      if (!owner || !target) return null;
      const d = dist(owner, target) || 1;
      const speed = o.speed != null ? o.speed : 520;
      const vx = ((target.x - owner.x) / d) * speed;
      const vy = ((target.y - owner.y) / d) * speed;
      // Face heroes toward the shot
      if (owner.facingRight != null && Math.abs(target.x - owner.x) > 3) {
        owner.facingRight = target.x > owner.x;
      }
      const life = Math.min(1.35, (d / speed) + 0.18);
      return spawnProjectile({
        x: owner.x,
        y: owner.y - (o.yOff != null ? o.yOff : 4),
        vx, vy,
        r: o.r != null ? o.r : 5,
        dmg,
        team: owner.team,
        owner,
        life,
        color: o.color || basicBoltColor(owner),
        skill: false,
        kind: o.kind || 'bolt',
        glow: o.glow != null ? o.glow : 11,
      });
    }

    function applyItemStats(axie) {
      if (!axie._baseMaxHpInit) {
        let base = roster.starters.find((s) => s.id === axie.defId).stats.hp;
        if (axie.team === 'player') base = Math.round(base * 1.10);
        axie._baseMaxHp = base;
        axie._baseMaxHpInit = true;
      }
      axie.speed = axie.baseSpeed + (axie.items.boots ? 28 : 0);
      // chaseSpeed gene applied in moveSpeed() when moving toward a foe
      const lv = Math.max(1, axie.level || 1);
      const newMax = axie._baseMaxHp + (axie.items.vial ? 120 : 0) + (lv - 1) * LEVEL_BONUS.maxHp;
      if (newMax !== axie.maxHp) {
        const gained = newMax - axie.maxHp;
        axie.maxHp = newMax;
        if (gained > 0) axie.hp = Math.min(newMax, axie.hp + gained);
      }
    }


    function originsDefender(axie, key) {
      if (!axie || key === 'E') return null;
      const range = (axie.defId === 'puffy' && key === 'Q') ? 340 : (key === 'R' ? 160 : 130);
      const t = nearest(axie, enemiesOf(axie), range);
      return t ? { x: t.x, y: t.y } : null;
    }

    function castSkill(axie, key) {
      if (!state.running || state.ended) return false;
      if (!axie || !axie.alive) return false;
      // Player may only cast on the selected (controlled) Axie; bot casts freely
      if (axie.team === 'player' && !axie.controlled) return false;
      const sk = axie.skills[key];
      if (!sk || sk.cd > 0) return false;
      sk.cd = sk.max;
      const facing = axie.facingRight ? 1 : -1;
      const partName = sk.name;
      log(`${axie.name}: ${partName} (${key})`);

      if (axie.defId === 'buba') castBuba(axie, key, facing, partName);
      else if (axie.defId === 'olek') castOlek(axie, key, facing, partName);
      else if (axie.defId === 'puffy') castPuffy(axie, key, facing, partName);
      else castGeneric(axie, key, facing, partName);

      // Origins Battle Kit additive skill VFX (canvas overlay). Safe no-op if not ready.
      try {
        if (global.OriginsVfx && global.OriginsVfx.playSkillVfx) {
          global.OriginsVfx.playSkillVfx(axie, key, originsDefender(axie, key));
        }
      } catch (e) { /* ignore vfx errors */ }

      // Three.js GLB attack/skill oneshot. Safe no-op if overlay not ready.
      try {
        if (global.GlbHeroes && global.GlbHeroes.playAttack) {
          global.GlbHeroes.playAttack(axie, key);
        }
      } catch (e) { /* ignore glb errors */ }

      // Spine attack spike (Mixer sample genes). Safe no-op if overlay not ready.
      try {
        if (global.SpineHeroes && global.SpineHeroes.playAttackForAxie) {
          global.SpineHeroes.playAttackForAxie(axie, key);
        }
      } catch (e) { /* ignore spine errors */ }

      if (ui.renderSkills && axie.controlled) ui.renderSkills(axie);
      return true;
    }

    function castBuba(axie, key, facing, partName) {
      if (key === 'Q') {
        // Leaf Bite — short melee cone / nearest foe, heal on hit
        const range = axie.atkRange + 28;
        const foes = enemiesOf(axie).filter((f) => inFrontArc(axie, f, axie.facingRight, range, 48));
        let t = nearest(axie, foes, range);
        if (!t) t = nearest(axie, enemiesOf(axie), 52);
        pushRing(axie.x + facing * 22, axie.y, 36, '#6bcf7a', 0.35, { shock: true, fill: true });
        state.fx.push({ x: axie.x, y: axie.y - 26, text: partName, life: 0.7, color: '#8dff9a' });
        if (t) {
          const dealt = dealDamage(axie, t, axie.atk * 1.55, { skill: true });
          if (dealt > 0) {
            const heal = Math.round(Math.min(axie.maxHp * 0.06, 28 + axie.atk * 0.25));
            axie.hp = Math.min(axie.maxHp, axie.hp + heal);
            state.fx.push({ x: axie.x, y: axie.y - 40, text: `+${heal}`, life: 0.7, color: '#9ef0c0' });
            log(`${partName} hits ${t.name || t.type} — healed ${heal}`);
          }
        }
      } else if (key === 'W') {
        // Wooden Stake — poke + brief slow
        const range = axie.atkRange + 36;
        const foes = enemiesOf(axie).filter((f) => inFrontArc(axie, f, axie.facingRight, range, 40));
        const t = nearest(axie, foes, range) || nearest(axie, enemiesOf(axie), 60);
        state.fx.push({ x: axie.x + facing * 30, y: axie.y - 18, text: partName, life: 0.65, color: '#c4a35a' });
        if (t) {
          dealDamage(axie, t, axie.atk * 1.2, { skill: true });
          applySlow(t, 2.2);
          state.fx.push({ x: t.x, y: t.y - 28, text: 'SLOW', life: 0.55, color: '#c8e0a0' });
          log(`${partName} slows ${t.name || t.type}`);
        }
      } else if (key === 'E') {
        // Pumpkin Shell — timed self shield
        axie.buffs.shield = 95;
        axie.buffs.shieldDur = 3.5;
        pushRing(axie.x, axie.y, 40, '#e8b84a', 0.55, { shock: true, fill: true, lineW: 3 });
        state.fx.push({ x: axie.x, y: axie.y - 28, text: partName, life: 0.8, color: '#ffd27a' });
        log(`${partName} — shield up 3.5s`);
      } else if (key === 'R') {
        // Carrot Slam — small AoE around Buba
        const radius = 88;
        pushRing(axie.x, axie.y, radius, '#f0a060', 0.55, { shock: true, fill: true, lineW: 3 });
        pushRing(axie.x, axie.y, radius * 0.55, '#ffd0a0', 0.35, { shock: true, fill: false, lineW: 2 });
        spawnImpact(axie.x, axie.y, '#ffb070', 1.15);
        state.fx.push({ x: axie.x, y: axie.y - 30, text: partName, life: 0.75, color: '#ffb070' });
        const hits = enemiesOf(axie).filter((f) => dist(axie, f) <= radius + (f.r || 8));
        hits.forEach((f) => dealDamage(axie, f, axie.atk * 1.35, { skill: true }));
        if (hits.length) log(`${partName} smashes ${hits.length} foe(s)`);
      }
    }

    function castOlek(axie, key, facing, partName) {
      if (key === 'Q') {
        // Hungry Snap — fast bite + short self haste
        const range = axie.atkRange + 18;
        const foes = enemiesOf(axie).filter((f) => inFrontArc(axie, f, axie.facingRight, range, 42));
        const t = nearest(axie, foes, range) || nearest(axie, enemiesOf(axie), 48);
        state.fx.push({ x: axie.x + facing * 18, y: axie.y - 20, text: partName, life: 0.6, color: '#ff9a5a' });
        if (t) {
          dealDamage(axie, t, axie.atk * 1.3, { skill: true });
          log(`${partName} bites ${t.name || t.type}`);
        }
        axie.buffs.haste = Math.max(axie.buffs.haste, 2.4);
        state.fx.push({ x: axie.x, y: axie.y - 36, text: 'HASTE', life: 0.55, color: '#ffd0a0' });
      } else if (key === 'W') {
        // Ram Horn — dash forward + damage on contact
        const dash = 95;
        const steps = 6;
        const hit = new Set();
        state.fx.push({ x: axie.x, y: axie.y - 24, text: partName, life: 0.65, color: '#e07030' });
        for (let i = 0; i < steps; i++) {
          axie.x += facing * (dash / steps);
          resolveTreeCollision(axie);
          enemiesOf(axie).forEach((f) => {
            if (dist(axie, f) < 52 + (f.r || 0) && !hit.has(f)) {
              hit.add(f);
              dealDamage(axie, f, axie.atk * 1.15, { skill: true });
            }
          });
        }
        axie.facingRight = facing > 0;
        axie.targetX = axie.x;
        axie.targetY = axie.y;
        pushRing(axie.x, axie.y, 44, '#ff8a4a', 0.4, { shock: true, fill: true });
        spawnImpact(axie.x, axie.y, '#ff8a4a', 0.9);
        if (hit.size) log(`${partName} rams ${hit.size} foe(s)`);
      } else if (key === 'E') {
        // Fur Mantle — brief move-speed buff
        axie.buffs.msBuff = Math.max(axie.buffs.msBuff, 3.2);
        pushRing(axie.x, axie.y, 30, '#d4a574', 0.45);
        state.fx.push({ x: axie.x, y: axie.y - 28, text: partName, life: 0.75, color: '#e8c090' });
        log(`${partName} — move speed up`);
      } else if (key === 'R') {
        // Whip Lash — cleave arc in front
        const range = 105;
        pushRing(axie.x + facing * 20, axie.y, 62, '#ff7040', 0.42, {
          shock: true, fill: true, lineW: 3,
          arc: { facingRight: facing > 0, halfRad: 1.15 },
        });
        spawnImpact(axie.x + facing * 48, axie.y, '#ff9060', 0.85);
        state.fx.push({ x: axie.x, y: axie.y - 28, text: partName, life: 0.7, color: '#ff9060' });
        const hits = enemiesOf(axie).filter((f) => inFrontArc(axie, f, axie.facingRight, range, 70));
        hits.forEach((f) => dealDamage(axie, f, axie.atk * 1.4, { skill: true }));
        if (hits.length) log(`${partName} cleaves ${hits.length} foe(s)`);
      }
    }

    function castPuffy(axie, key, facing, partName) {
      if (key === 'Q') {
        // Bubble Kiss — ranged projectile toward nearest foe / facing
        const aimFoes = enemiesOf(axie).filter((f) => dist(axie, f) < 340);
        const t = nearest(axie, aimFoes, 340);
        let vx = facing * 340;
        let vy = 0;
        if (t) {
          const d = dist(axie, t) || 1;
          vx = ((t.x - axie.x) / d) * 340;
          vy = ((t.y - axie.y) / d) * 340;
          if (Math.abs(t.x - axie.x) > 4) axie.facingRight = t.x > axie.x;
        }
        spawnProjectile({
          x: axie.x, y: axie.y,
          vx, vy,
          r: 9, dmg: axie.atk * 1.25, team: axie.team,
          owner: axie, life: 1.2, color: '#7ec8ff', skill: true,
          kind: 'bubble', glow: 18,
        });
        pushRing(axie.x + facing * 16, axie.y, 16, '#9ad8ff', 0.28, { shock: true, fill: true });
        state.fx.push({ x: axie.x, y: axie.y - 24, text: partName, life: 0.6, color: '#9ad8ff' });
      } else if (key === 'W') {
        // Coral Spike — piercing poke + armor shred
        const range = axie.atkRange + 50;
        const line = enemiesOf(axie).filter((f) => inFrontArc(axie, f, axie.facingRight, range, 32));
        state.fx.push({ x: axie.x + facing * 40, y: axie.y - 18, text: partName, life: 0.65, color: '#5ab0d4' });
        pushRing(axie.x + facing * 50, axie.y, 30, '#4aa0c8', 0.38, { shock: true, fill: true, arc: { facingRight: facing > 0, halfRad: 0.7 } });
        line.forEach((f) => {
          dealDamage(axie, f, axie.atk * 1.15, { skill: true });
          if (f.buffs) {
            f.buffs.armorShred = Math.max(f.buffs.armorShred || 0, 3.5);
            f.buffs.shredAmt = Math.max(f.buffs.shredAmt || 0, 6);
            state.fx.push({ x: f.x, y: f.y - 30, text: 'SHRED', life: 0.55, color: '#80d0f0' });
          }
        });
        if (line.length) log(`${partName} pierces ${line.length} — armor shredded`);
      } else if (key === 'E') {
        // Scale Veil — damage taken * 0.7 for duration
        axie.buffs.veil = Math.max(axie.buffs.veil, 3.0);
        pushRing(axie.x, axie.y, 38, '#6ad0e8', 0.55, { shock: true, fill: true, lineW: 3 });
        state.fx.push({ x: axie.x, y: axie.y - 28, text: partName, life: 0.75, color: '#a0e8ff' });
        log(`${partName} — take 30% less damage`);
      } else if (key === 'R') {
        // Tidal Finish — execute single target; bonus below ~40% HP
        const range = axie.atkRange + 40;
        const foes = enemiesOf(axie).filter((f) => dist(axie, f) <= range + (f.r || 8));
        const t = nearest(axie, foes, range + 20);
        state.fx.push({ x: axie.x, y: axie.y - 28, text: partName, life: 0.75, color: '#4ec4ff' });
        if (t) {
          const low = t.hp / t.maxHp < 0.4;
          pushRing(t.x, t.y, 48, low ? '#ff6a8a' : '#5ab8e8', 0.5, { shock: true, fill: true, lineW: 3 });
          spawnImpact(t.x, t.y, low ? '#ff6a8a' : '#5ab8e8', low ? 1.2 : 1);
          dealDamage(axie, t, axie.atk * 1.85, { skill: true, execute: true });
          log(`${partName} on ${t.name || t.type}${low ? ' (EXECUTE)' : ''}`);
        }
      }
    }

    function castGeneric(axie, key, facing, partName) {
      const foes = enemiesOf(axie).filter((f) => dist(axie, f) < 100);
      foes.slice(0, 2).forEach((f) => dealDamage(axie, f, axie.atk * 1.1, { skill: true }));
      state.fx.push({ x: axie.x, y: axie.y - 24, text: partName, life: 0.6, color: '#ddd' });
    }

    function updateProjectiles(dt) {
      for (const p of state.projectiles) {
        p.life -= dt;
        p.x += p.vx * dt;
        p.y += p.vy * dt;
        // Trail crumbs
        p.trailAcc = (p.trailAcc || 0) + dt;
        if (p.trailAcc >= 0.028) {
          p.trailAcc = 0;
          if (!p.trail) p.trail = [];
          p.trail.push({ x: p.x, y: p.y, life: 0.22, maxLife: 0.22, r: p.r * 0.7 });
          if (p.trail.length > 10) p.trail.shift();
        }
        if (p.trail) {
          for (const t of p.trail) t.life -= dt;
          p.trail = p.trail.filter((t) => t.life > 0);
        }
        const foes = enemiesOf(p.owner).filter((f) => dist(p, f) < p.r + (f.r || 10));
        if (foes.length) {
          dealDamage(p.owner, foes[0], p.dmg, p.skill ? { skill: true } : undefined);
          spawnImpact(p.x, p.y, p.color, p.kind === 'bubble' ? 1.1 : 0.95);
          p.life = 0;
        } else if (p.life <= 0) {
          // soft pop when expiring
          pushRing(p.x, p.y, p.r * 2.2, p.color, 0.22, { shock: true, fill: true });
        }
      }
      state.projectiles = state.projectiles.filter((p) => p.life > 0);
    }

    function updateChannel(dt) {
      if (!state.channel) return;
      state.channel.t += dt;
      if (ui.setChannel) {
        ui.setChannel(true, `Reassigning to ${state.channel.lane}… ${(state.channel.dur - state.channel.t).toFixed(1)}s`);
      }
      if (state.channel.t >= state.channel.dur) {
        const ax = state.channel.axie;
        ax.lane = state.channel.lane;
        ax.y = LANE_Y[ax.lane];
        ax.targetY = ax.y;
        log(`${ax.name} reassigned to ${ax.lane} lane`);
        state.channel = null;
        if (ui.setChannel) ui.setChannel(false);
      }
    }

    function startLaneChannel(lane) {
      const ax = selected();
      if (!ax || !ax.alive) return;
      if (!inSanctuary(ax)) {
        log('Lane reassign only at Sanctuary');
        return;
      }
      if (ax.lane === lane) return;
      state.channel = { axie: ax, lane, t: 0, dur: 10 };
      log(`Channeling lane swap → ${lane} (10s)`);
    }

    function buyItem(itemId) {
      const ax = selected();
      if (!ax || !ax.alive) return;
      const item = state.shop.find((s) => s.id === itemId);
      if (!item) return;
      if (ax.items[itemId]) {
        log(`${ax.name} already has ${item.name}`);
        return;
      }
      if (state.gold < item.cost) {
        log('Not enough gold');
        return;
      }
      state.gold -= item.cost;
      ax.items[itemId] = true;
      applyItemStats(ax);
      log(`${ax.name} equipped ${item.name}`);
      if (ui.renderShop) ui.renderShop(state);
      if (ui.renderAxies) ui.renderAxies(state);
    }

    function selectAxie(idx) {
      const pals = playerAxies();
      if (idx < 0 || idx >= pals.length) return;
      // Manual / Tab selects cancel corpse linger (death re-sets linger after this call)
      state.camCorpsePos = null;
      state.camCorpseUntil = 0;
      pals.forEach((a) => { a.controlled = false; });
      state.selectedIdx = idx;
      const ax = pals[idx];
      ax.controlled = true;
      if (ax.alive) {
        ax.targetX = ax.x;
        ax.targetY = ax.y;
      }
      state.channel = null;
      if (ui.setChannel) ui.setChannel(false);
      if (ui.renderAxies) ui.renderAxies(state);
      if (ui.renderSkills) ui.renderSkills(ax);
      if (ui.renderShop) ui.renderShop(state);
      if (ui.renderDens) ui.renderDens(state);
    }

    /** Tab: cycle player Axies; prefer living, else wrap all slots. */
    function cycleAxie() {
      const pals = playerAxies();
      const n = pals.length;
      if (!n) return;
      for (let step = 1; step <= n; step++) {
        const idx = (state.selectedIdx + step) % n;
        if (pals[idx].alive) {
          selectAxie(idx);
          return;
        }
      }
      selectAxie((state.selectedIdx + 1) % n);
    }

    /** Apply starter species template to an Axie; keep level / items / hp%. */
    function applySpeciesTemplate(axie, def) {
      const hpPct = axie.maxHp > 0 ? axie.hp / axie.maxHp : 1;
      const lv = Math.max(1, axie.level || 1);
      const genes = genesOf(def);
      const sid = def.speciesId || classIdForStarter(def.id);
      const sp = speciesDef(sid);
      axie.defId = def.id;
      axie.id = `${axie.team}-${axie.lane}-${def.id}`;
      axie.name = def.name;
      axie.class = def.class || properClassName(sid);
      axie.speciesId = sid;
      axie.role = def.role;
      axie.color = def.color;
      axie.sprite = def.sprite || null;
      applyGeneTraitFlags(axie, genes, sp && sp.trait);
      let baseHp = def.stats.hp;
      if (axie.team === 'player') baseHp = Math.round(baseHp * 1.10);
      axie._baseMaxHp = baseHp;
      axie._baseMaxHpInit = true;
      axie.baseSpeed = def.stats.speed;
      axie.atk = def.stats.atk + (lv - 1) * LEVEL_BONUS.atk;
      const baseArmor = axie.team === 'player' ? def.stats.armor + 2 : def.stats.armor;
      axie.armor = baseArmor + (lv - 1) * LEVEL_BONUS.armor;
      axie.atkRange = def.stats.atkRange + (axie.atkRangeGene || 0);
      axie.atkCooldown = def.stats.atkCooldown;
      if (genes) {
        if (genes.mouth) axie.skills.Q.name = genes.mouth.name;
        if (genes.horn) axie.skills.W.name = genes.horn.name;
        if (genes.back) axie.skills.E.name = genes.back.name;
        if (genes.tail) axie.skills.R.name = genes.tail.name;
      }
      applyItemStats(axie);
      axie.hp = clamp(axie.maxHp * hpPct, axie.alive ? 1 : 0, axie.maxHp);
    }

    /** Breed Den Pack species from 2–3 roster parents (dead OK). Den/Packs only — no Axie transform.
     * Outcome: uniform random among all 9 Axie classes (parents are flavor / Core feel; they do not limit the pool). */
    function breedDenPacks(lane, parentIds, team) {
      team = team || 'player';
      if (team !== 'player') return false;
      const den = denFor(team, lane);
      if (!den || !den.alive) {
        log(`No living Den on ${lane}`);
        return false;
      }
      const ids = Array.isArray(parentIds) ? parentIds.filter(Boolean) : [];
      const pals = state.axies.filter((a) => a.team === 'player');
      const parents = [];
      const seen = new Set();
      for (const id of ids) {
        if (seen.has(id)) continue;
        const ax = pals.find((a) => a.id === id);
        if (ax) {
          parents.push(ax);
          seen.add(id);
        }
      }
      if (parents.length < 2 || parents.length > 3) {
        log('Select 2 or 3 Axies to breed Packs');
        return false;
      }
      if (state.gold < BREED_PACK_COST) {
        log(`Need ${BREED_PACK_COST}g to breed Packs`);
        return false;
      }
      if (!PACK_CLASS_IDS.length) {
        log('Breed failed — no pack classes');
        return false;
      }
      // Uniform across all 9 official Axie classes (not limited to parent starters).
      const rolled = PACK_CLASS_IDS[Math.floor(Math.random() * PACK_CLASS_IDS.length)];
      const def = packSpeciesDef(rolled);
      if (!def) {
        log('Breed failed — unknown species');
        return false;
      }
      state.gold -= BREED_PACK_COST;
      den.speciesId = rolled;
      const label = lane[0].toUpperCase() + lane.slice(1);
      const traitName = (def.trait && def.trait.name) || '';
      const traitBit = traitName ? ` [${traitName}]` : '';
      log(`Bred ${label} Packs → ${def.name}${traitBit}! (−${BREED_PACK_COST}g)`);
      if (ui.renderShop) ui.renderShop(state);
      if (ui.renderDens) ui.renderDens(state);
      if (ui.renderHud) ui.renderHud(state);
      if (ui.refreshDenModal) ui.refreshDenModal(den);
      return {
        speciesId: rolled,
        name: def.name,
        trait: def.trait || null,
        den,
      };
    }

    function denUpgradeCost(den) {
      if (!den || !den.alive) return null;
      if (den.level >= DEN_MAX_LEVEL) return null;
      return DEN_UPGRADE_COST[den.level];
    }

    function upgradeDen(lane, team) {
      team = team || 'player';
      const den = denFor(team, lane);
      if (!den || !den.alive) {
        if (team === 'player') log(`No living Den on ${lane}`);
        return false;
      }
      if (den.level >= DEN_MAX_LEVEL) {
        if (team === 'player') log(`${lane} Den already max (L${den.level})`);
        return false;
      }
      const cost = DEN_UPGRADE_COST[den.level];
      if (team === 'player') {
        if (state.gold < cost) {
          log('Not enough gold for Den upgrade');
          return false;
        }
        state.gold -= cost;
      } else {
        if (state.enemyGold < cost) return false;
        state.enemyGold -= cost;
      }
      den.level += 1;
      if (team === 'player') {
        log(`${lane} Den upgraded → L${den.level} (−${cost}g). Stronger Packs.`);
        if (ui.renderShop) ui.renderShop(state);
        if (ui.renderDens) ui.renderDens(state);
        if (ui.renderHud) ui.renderHud(state);
        if (ui.refreshDenModal) ui.refreshDenModal(den);
      }
      return true;
    }

    function spireFor(team, lane, tier) {
      return state.structures.find(
        (s) => s.type === 'spire' && s.team === team && s.lane === lane && s.tier === tier
      ) || null;
    }

    function spireLabel(spire) {
      if (!spire) return 'Spire';
      const lane = spire.lane[0].toUpperCase() + spire.lane.slice(1);
      return `${lane} T${spire.tier} Spire`;
    }

    function spireRepairCost(spire) {
      if (!spire || !spire.alive) return null;
      const missing = spire.maxHp - spire.hp;
      if (missing <= 0) return null;
      const frac = missing / spire.maxHp;
      return frac > 0.4 ? SPIRE_REPAIR_COST_HEAVY : SPIRE_REPAIR_COST_LIGHT;
    }

    function spireRepairAmount(spire) {
      if (!spire || !spire.alive) return 0;
      const missing = spire.maxHp - spire.hp;
      if (missing <= 0) return 0;
      return Math.min(missing, Math.round(spire.maxHp * SPIRE_REPAIR_PCT));
    }

    function spireUpgradeCost(spire) {
      if (!spire || !spire.alive) return null;
      if ((spire.level || 0) >= SPIRE_MAX_LEVEL) return null;
      return SPIRE_UPGRADE_COST[spire.level || 0];
    }

    function repairSpire(lane, tier, team) {
      team = team || 'player';
      if (team !== 'player') return false;
      const spire = spireFor(team, lane, tier);
      if (!spire || !spire.alive) {
        log('That Spire is destroyed — no rebuild this round');
        return false;
      }
      const cost = spireRepairCost(spire);
      const heal = spireRepairAmount(spire);
      if (cost == null || heal <= 0) {
        log(`${spireLabel(spire)} is already at full HP`);
        return false;
      }
      if (state.gold < cost) {
        log(`Need ${cost}g to repair Spire`);
        return false;
      }
      state.gold -= cost;
      spire.hp = Math.min(spire.maxHp, spire.hp + heal);
      log(`Repaired ${spireLabel(spire)} +${heal} HP (−${cost}g)`);
      if (ui.renderShop) ui.renderShop(state);
      if (ui.renderHud) ui.renderHud(state);
      if (ui.refreshSpireModal) ui.refreshSpireModal(spire);
      return true;
    }

    function upgradeSpire(lane, tier, team) {
      team = team || 'player';
      if (team !== 'player') return false;
      const spire = spireFor(team, lane, tier);
      if (!spire || !spire.alive) {
        log('That Spire is destroyed — cannot upgrade');
        return false;
      }
      const lv = spire.level || 0;
      if (lv >= SPIRE_MAX_LEVEL) {
        log(`${spireLabel(spire)} already max (L${lv})`);
        return false;
      }
      const cost = SPIRE_UPGRADE_COST[lv];
      const bonus = SPIRE_UPGRADE_BONUS[lv];
      if (state.gold < cost) {
        log(`Need ${cost}g to upgrade Spire`);
        return false;
      }
      state.gold -= cost;
      spire.level = lv + 1;
      spire.maxHp += bonus.maxHp;
      spire.atkDamage += bonus.atk;
      spire.hp = Math.min(spire.maxHp, spire.hp + bonus.heal);
      log(
        `Upgraded ${spireLabel(spire)} → L${spire.level} (+${bonus.maxHp} HP, +${bonus.atk} atk) (−${cost}g)`
      );
      if (ui.renderShop) ui.renderShop(state);
      if (ui.renderHud) ui.renderHud(state);
      if (ui.refreshSpireModal) ui.refreshSpireModal(spire);
      return true;
    }

    function enemyShopAI() {
      // Bot spends gold simply
      const enemies = state.axies.filter((a) => a.team === 'enemy' && a.alive);
      for (const ax of enemies) {
        for (const item of state.shop) {
          if (!ax.items[item.id] && state.enemyGold >= item.cost) {
            state.enemyGold -= item.cost;
            ax.items[item.id] = true;
            applyItemStats(ax);
            break;
          }
        }
      }
      // Optionally upgrade one Den mid-game (cheap / once-ish)
      if (!state._enemyDenUpgradeDone && state.t >= 70 && state.enemyGold >= DEN_UPGRADE_COST[0]) {
        const dens = state.structures.filter(
          (s) => s.type === 'den' && s.team === 'enemy' && s.alive && s.level < DEN_MAX_LEVEL
        );
        if (dens.length) {
          dens.sort((a, b) => a.level - b.level);
          if (upgradeDen(dens[0].lane, 'enemy')) {
            state._enemyDenUpgradeDone = true;
            log(`Enemy upgraded their ${dens[0].lane} Den`);
          }
        }
      }
    }

    function respawnCheck() {
      for (const a of state.axies) {
        if (!a.alive && state.t >= a.respawnAt) {
          a.alive = true;
          a.hp = a.maxHp;
          const s = sanctuaryPos(a.team);
          a.x = s.x + (a.team === 'player' ? 30 : -30);
          a.y = LANE_Y[a.lane];
          a.targetX = a.x;
          a.targetY = a.y;
          log(`${a.name} returned from Sanctuary`);
        }
      }
    }

    function cameraFocus() {
      // Brief linger on fallen selected, else follow current selection (living or corpse)
      if (state.camCorpsePos && state.t < state.camCorpseUntil) {
        return state.camCorpsePos;
      }
      state.camCorpsePos = null;
      const ax = selected();
      if (ax) return { x: ax.x, y: ax.y };
      return { x: W / 2, y: H / 2 };
    }

    function updateCamera(dt) {
      const targetZoom = state.zoomOutHeld ? ZOOM_OUT : ZOOM_IN;
      const zAlpha = 1 - Math.exp(-ZOOM_LERP * dt);
      state.cam.zoom += (targetZoom - state.cam.zoom) * zAlpha;

      const focus = cameraFocus();
      const fAlpha = 1 - Math.exp(-CAM_FOLLOW * dt);
      state.cam.x += (focus.x - state.cam.x) * fAlpha;
      state.cam.y += (focus.y - state.cam.y) * fAlpha;

      // Keep view inside map bounds
      const z = Math.max(0.01, state.cam.zoom);
      const halfW = W / (2 * z);
      const halfH = H / (2 * z);
      state.cam.x = clamp(state.cam.x, halfW, W - halfW);
      state.cam.y = clamp(state.cam.y, halfH, H - halfH);
    }

    function screenToWorld(clientX, clientY) {
      const rect = canvas.getBoundingClientRect();
      const sx = (clientX - rect.left) * (canvas.width / rect.width);
      const sy = (clientY - rect.top) * (canvas.height / rect.height);
      const z = state.cam.zoom;
      return {
        x: (sx - W / 2) / z + state.cam.x,
        y: (sy - H / 2) / z + state.cam.y,
      };
    }

    function setZoomOutHeld(held) {
      state.zoomOutHeld = !!held;
    }

    function update(dt) {
      if (!state.running || state.ended) return;
      state.t += dt;
      state.packTimer -= dt;
      if (state.packTimer <= 0) {
        state.packTimer = PACK_INTERVAL;
        spawnPackWave();
      }

      respawnCheck();
      updateChannel(dt);
      updateStructures(dt);
      updateProjectiles(dt);

      for (const a of state.axies) {
        if (!a.alive) continue;
        applyItemStats(a);
        updateBuffs(a, dt);
        if (a.team === 'player' && a.controlled) updateControlled(a, dt);
        else updateHeroAI(a, dt);
      }
      for (const p of living(state.packs)) updatePack(p, dt);
      state.packs = state.packs.filter((p) => p.alive);

      // Enemy bot: occasionally cast when off CD and foe in range (E is self-buff)
      if (Math.random() < dt * 0.14) {
        const bots = living(state.axies).filter((a) => a.team === 'enemy');
        const ax = bots[Math.floor(Math.random() * bots.length)];
        if (ax) {
          const ready = ['Q', 'W', 'E', 'R'].filter((k) => ax.skills[k].cd <= 0);
          if (ready.length) {
            const k = ready[Math.floor(Math.random() * ready.length)];
            const range = (k === 'Q' && ax.defId === 'puffy') ? 300 : (k === 'E' ? 9999 : 110);
            const near = k === 'E' || enemiesOf(ax).some((f) => dist(ax, f) < range);
            if (near) castSkill(ax, k);
          }
        }
      }
      if (Math.floor(state.t) % 20 === 0 && state._shopTick !== Math.floor(state.t)) {
        state._shopTick = Math.floor(state.t);
        enemyShopAI();
      }

      state.fx.forEach((f) => {
        f.life -= dt;
        if (f.spark) {
          f.x += (f.vx || 0) * dt;
          f.y += (f.vy || 0) * dt;
          f.vx = (f.vx || 0) * (1 - 3 * dt);
          f.vy = (f.vy || 0) * (1 - 3 * dt);
        } else if (f.text) {
          f.y -= 20 * dt;
        }
      });
      state.fx = state.fx.filter((f) => f.life > 0);

      if (ui.renderHud) ui.renderHud(state);
    }

    // --- Render ---
    function drawLaneGuides() {
      ctx.strokeStyle = 'rgba(80,110,80,0.38)';
      ctx.lineWidth = LANE_PATH_W;
      ctx.lineCap = 'round';
      LANES.forEach((lane) => {
        ctx.beginPath();
        ctx.moveTo(PLAYER_BASE_X + 20, LANE_Y[lane]);
        ctx.lineTo(ENEMY_BASE_X - 20, LANE_Y[lane]);
        ctx.stroke();
      });
      // jungle tint at map edges
      ctx.fillStyle = 'rgba(20,40,25,0.5)';
      ctx.fillRect(0, 0, W, 50);
      ctx.fillRect(0, H - 50, W, 50);
    }

    function drawTrees() {
      for (let i = 0; i < TREES.length; i++) {
        const t = TREES[i];
        // canopy
        ctx.beginPath();
        ctx.fillStyle = i % 2 === 0 ? '#2a5a32' : '#234e2c';
        ctx.arc(t.x, t.y, t.r, 0, Math.PI * 2);
        ctx.fill();
        // darker core / trunk hint
        ctx.beginPath();
        ctx.fillStyle = '#1a3a22';
        ctx.arc(t.x, t.y + 2, t.r * 0.45, 0, Math.PI * 2);
        ctx.fill();
      }
    }

    function drawSanctuary(team) {
      const s = sanctuaryPos(team);
      ctx.beginPath();
      ctx.fillStyle = team === 'player' ? 'rgba(60,140,90,0.35)' : 'rgba(140,70,40,0.35)';
      ctx.arc(s.x, s.y, SANCTUARY_R, 0, Math.PI * 2);
      ctx.fill();
      ctx.strokeStyle = team === 'player' ? '#5ad48a' : '#e08050';
      ctx.lineWidth = 2;
      ctx.stroke();
      ctx.fillStyle = '#cfe6d8';
      ctx.font = '11px sans-serif';
      ctx.textAlign = 'center';
      ctx.fillText('Sanctuary', s.x, s.y - SANCTUARY_R - 6);
    }

    function drawStruct(s) {
      if (!s.alive) {
        ctx.globalAlpha = 0.25;
      }
      if (s.type === 'nest') {
        ctx.fillStyle = s.team === 'player' ? '#2f6b3c' : '#7a3a22';
        ctx.beginPath();
        ctx.arc(s.x, s.y, s.r, 0, Math.PI * 2);
        ctx.fill();
        ctx.strokeStyle = s.unlocked ? '#ffd27a' : '#556';
        ctx.lineWidth = 3;
        ctx.stroke();
        ctx.fillStyle = '#fff';
        ctx.font = 'bold 11px sans-serif';
        ctx.textAlign = 'center';
        ctx.fillText('NEST', s.x, s.y + 4);
        if (!s.unlocked) {
          ctx.fillStyle = '#aaa';
          ctx.font = '9px sans-serif';
          ctx.fillText('locked', s.x, s.y + s.r + 12);
        }
      } else if (s.type === 'den') {
        // Wider / shorter than Spire — spawn building look
        const w = s.r * 2.2;
        const h = s.r * 1.35;
        ctx.fillStyle = s.team === 'player' ? '#2a6e4e' : '#8a4428';
        ctx.fillRect(s.x - w / 2, s.y - h / 2, w, h);
        ctx.strokeStyle = s.team === 'player' ? '#7dffb0' : '#ffb080';
        ctx.lineWidth = 2;
        ctx.strokeRect(s.x - w / 2, s.y - h / 2, w, h);
        // roof ridge
        ctx.fillStyle = '#1a2030';
        ctx.fillRect(s.x - w / 2 - 2, s.y - h / 2 - 6, w + 4, 6);
        ctx.fillStyle = '#e8eef5';
        ctx.font = 'bold 9px sans-serif';
        ctx.textAlign = 'center';
        const lv = s.level || 0;
        ctx.fillText(lv > 0 ? `DEN L${lv}` : 'DEN', s.x, s.y + 3);
      } else {
        const col = s.team === 'player' ? (s.tier === 2 ? '#3d8f5a' : '#4aa86a') : (s.tier === 2 ? '#b45a30' : '#c97848');
        ctx.fillStyle = col;
        ctx.fillRect(s.x - s.r * 0.7, s.y - s.r, s.r * 1.4, s.r * 2);
        ctx.fillStyle = '#1a2030';
        ctx.fillRect(s.x - 4, s.y - s.r - 10, 8, 12);
        ctx.fillStyle = '#e8eef5';
        ctx.font = '9px sans-serif';
        ctx.textAlign = 'center';
        const slv = s.level || 0;
        ctx.fillText(slv > 0 ? `T${s.tier} L${slv}` : `T${s.tier}`, s.x, s.y + 3);
      }
      // HP bar above alive Spire / Den / Nest (grey when Nest locked)
      if (s.alive) {
        const bw = s.type === 'nest' ? 56 : (s.type === 'den' ? 44 : 40);
        const bh = 6;
        const bx = s.x - bw / 2;
        const by = s.y - s.r - 20;
        const locked = s.type === 'nest' && !s.unlocked;
        ctx.fillStyle = '#0a0c10';
        ctx.fillRect(bx - 1, by - 1, bw + 2, bh + 2);
        ctx.fillStyle = '#222830';
        ctx.fillRect(bx, by, bw, bh);
        const ratio = Math.max(0, s.hp / s.maxHp);
        ctx.fillStyle = locked ? '#6a7180' : (s.team === 'player' ? '#5ad48a' : '#e08050');
        ctx.fillRect(bx, by, bw * ratio, bh);
        if (locked) {
          ctx.fillStyle = '#9aa3b2';
          ctx.font = '8px sans-serif';
          ctx.textAlign = 'center';
          ctx.fillText('locked', s.x, by - 3);
        }
      }
      ctx.globalAlpha = 1;
    }

    function drawAxie(a) {
      if (!a.alive) return;
      const sz = spriteDrawSize(a.defId);
      const halfH = sz.h / 2;
      const img = spriteCache[a.defId];
      const ready = spriteReady(a.defId);

      if (a.controlled) {
        // move target guide
        ctx.beginPath();
        ctx.strokeStyle = 'rgba(255,255,255,0.35)';
        ctx.setLineDash([4, 4]);
        ctx.moveTo(a.x, a.y);
        ctx.lineTo(a.targetX, a.targetY);
        ctx.stroke();
        ctx.setLineDash([]);
        ctx.beginPath();
        ctx.fillStyle = 'rgba(255,255,255,0.5)';
        ctx.arc(a.targetX, a.targetY, 4, 0, Math.PI * 2);
        ctx.fill();
      }

      const hideBody =
        (spineHeroesActive() && global.SpineHeroes.spines && global.SpineHeroes.spines.has(a.id)) ||
        (glbHeroesActive() && global.GlbHeroes.hasHero && global.GlbHeroes.hasHero(a.id));
      if (!hideBody) {
        if (ready) {
          ctx.save();
          ctx.translate(a.x, a.y);
          // PNGs face left; flip when facingRight
          if (a.facingRight) ctx.scale(-1, 1);
          ctx.drawImage(img, -sz.w / 2, -sz.h / 2, sz.w, sz.h);
          ctx.restore();
        } else {
          // Fallback until CDN PNG loads
          ctx.beginPath();
          ctx.fillStyle = a.color;
          ctx.arc(a.x, a.y, a.r, 0, Math.PI * 2);
          ctx.fill();
        }
      }

      // Selection / team ring
      ctx.beginPath();
      ctx.arc(a.x, a.y, Math.max(a.r + 2, halfH * 0.55), 0, Math.PI * 2);
      if (a.controlled) {
        ctx.strokeStyle = '#fff';
        ctx.lineWidth = 2;
      } else {
        ctx.strokeStyle = a.team === 'player' ? '#8cf' : '#f96';
        ctx.lineWidth = 1.5;
      }
      ctx.stroke();

      // Classic wood nameplate + floating green HP (white numeric)
      const plateY = a.y - halfH - 6;
      const barW = 36;
      const barH = 6;
      const barX = a.x - barW / 2;
      // wooden nameplate backing
      ctx.fillStyle = 'rgba(61, 40, 24, 0.85)';
      ctx.font = 'bold 10px Trebuchet MS, sans-serif';
      ctx.textAlign = 'center';
      const label = `${a.name} Lv${a.level || 1}`;
      const tw = Math.max(barW + 8, ctx.measureText(label).width + 10);
      ctx.fillRect(a.x - tw / 2, plateY - 14, tw, 12);
      ctx.strokeStyle = '#8a6a48';
      ctx.lineWidth = 1;
      ctx.strokeRect(a.x - tw / 2, plateY - 14, tw, 12);
      ctx.fillStyle = '#f4ead8';
      ctx.fillText(label, a.x, plateY - 5);
      // stone-framed HP bar
      ctx.fillStyle = '#1a120c';
      ctx.fillRect(barX - 1, plateY - 1, barW + 2, barH + 2);
      ctx.strokeStyle = '#6a4a30';
      ctx.lineWidth = 1;
      ctx.strokeRect(barX - 1, plateY - 1, barW + 2, barH + 2);
      ctx.fillStyle = a.team === 'player' ? '#4ec85a' : '#e67a2e';
      ctx.fillRect(barX, plateY, barW * Math.max(0, a.hp / a.maxHp), barH);
      // white HP number above bar
      ctx.fillStyle = '#ffffff';
      ctx.font = 'bold 9px Trebuchet MS, sans-serif';
      ctx.strokeStyle = 'rgba(0,0,0,0.65)';
      ctx.lineWidth = 2.5;
      const hpLabel = a.alive ? `${Math.ceil(a.hp)}` : '0';
      ctx.strokeText(hpLabel, a.x, plateY - 16);
      ctx.fillText(hpLabel, a.x, plateY - 16);
    }

    function drawPack(p) {
      const sid = p.speciesId;
      const sz = spriteDrawSize(sid, PACK_SPRITE_W);
      const img = sid ? spriteCache[sid] : null;
      const ready = sid && spriteReady(sid);
      const classColor = packSpeciesColor(sid);
      if (ready) {
        ctx.save();
        ctx.translate(p.x, p.y);
        if (p.facingRight) ctx.scale(-1, 1);
        // Soft team tint via alpha underlay
        ctx.globalAlpha = 0.22;
        ctx.fillStyle = p.team === 'player' ? '#5ad48a' : '#e08050';
        ctx.beginPath();
        ctx.arc(0, 0, Math.max(p.r + 2, sz.w * 0.38), 0, Math.PI * 2);
        ctx.fill();
        ctx.globalAlpha = 1;
        ctx.drawImage(img, -sz.w / 2, -sz.h / 2, sz.w, sz.h);
        ctx.restore();
      } else {
        // Class-colored circle when CDN sprite missing / not loaded
        ctx.fillStyle = classColor;
        ctx.beginPath();
        ctx.arc(p.x, p.y, p.r, 0, Math.PI * 2);
        ctx.fill();
        ctx.strokeStyle = p.team === 'player' ? '#5ad48a' : '#e08050';
        ctx.lineWidth = 1.5;
        ctx.stroke();
      }
      // Classic mini green HP + white number for Packs
      const barW = 18;
      const barH = 4;
      const plateY = p.y - (ready ? sz.h / 2 : p.r) - 8;
      const barX = p.x - barW / 2;
      ctx.fillStyle = '#1a120c';
      ctx.fillRect(barX - 1, plateY - 1, barW + 2, barH + 2);
      ctx.strokeStyle = '#6a4a30';
      ctx.lineWidth = 1;
      ctx.strokeRect(barX - 1, plateY - 1, barW + 2, barH + 2);
      ctx.fillStyle = p.team === 'player' ? '#4ec85a' : '#e67a2e';
      ctx.fillRect(barX, plateY, barW * Math.max(0, p.hp / p.maxHp), barH);
      ctx.fillStyle = '#ffffff';
      ctx.font = 'bold 8px Trebuchet MS, sans-serif';
      ctx.textAlign = 'center';
      ctx.strokeStyle = 'rgba(0,0,0,0.6)';
      ctx.lineWidth = 2;
      const pHp = `${Math.ceil(p.hp)}`;
      ctx.strokeText(pHp, p.x, plateY - 3);
      ctx.fillText(pHp, p.x, plateY - 3);
    }

    // --- Fog of War (simple Round 1) ---
    let fogCanvas = null;
    let fogCtx = null;

    function ensureFogCanvas() {
      if (fogCanvas) return;
      fogCanvas = document.createElement('canvas');
      fogCanvas.width = W;
      fogCanvas.height = H;
      fogCtx = fogCanvas.getContext('2d');
    }

    function visionSources() {
      const src = [];
      for (const a of state.axies) {
        if (a.team === 'player' && a.alive) src.push({ x: a.x, y: a.y, r: FOG_VISION_AXIE });
      }
      for (const p of state.packs) {
        if (p.team === 'player' && p.alive) src.push({ x: p.x, y: p.y, r: FOG_VISION_PACK });
      }
      for (const s of state.structures) {
        if (s.team !== 'player' || !s.alive) continue;
        let r = FOG_VISION_SPIRE;
        if (s.type === 'den') r = FOG_VISION_DEN;
        else if (s.type === 'nest') r = FOG_VISION_NEST;
        src.push({ x: s.x, y: s.y, r });
      }
      return src;
    }

    function drawFogOfWar(sources) {
      ensureFogCanvas();
      const list = sources || visionSources();
      fogCtx.setTransform(1, 0, 0, 1, 0, 0);
      fogCtx.globalCompositeOperation = 'source-over';
      fogCtx.clearRect(0, 0, W, H);
      fogCtx.fillStyle = `rgba(0,0,0,${FOG_ALPHA})`;
      fogCtx.fillRect(0, 0, W, H);
      fogCtx.globalCompositeOperation = 'destination-out';
      for (const s of list) {
        const inner = s.r * 0.55;
        const g = fogCtx.createRadialGradient(s.x, s.y, inner, s.x, s.y, s.r);
        g.addColorStop(0, 'rgba(0,0,0,1)');
        g.addColorStop(0.7, 'rgba(0,0,0,0.7)');
        g.addColorStop(1, 'rgba(0,0,0,0)');
        fogCtx.fillStyle = g;
        fogCtx.beginPath();
        fogCtx.arc(s.x, s.y, s.r, 0, Math.PI * 2);
        fogCtx.fill();
      }
      fogCtx.globalCompositeOperation = 'source-over';
      ctx.drawImage(fogCanvas, 0, 0);
    }

    function render() {
      ctx.clearRect(0, 0, W, H);
      ctx.save();
      // Camera: scale around screen center, focus on cam (x,y)
      ctx.translate(W / 2, H / 2);
      ctx.scale(state.cam.zoom, state.cam.zoom);
      ctx.translate(-state.cam.x, -state.cam.y);

      // background: Tiled tilemap (primary) → painted plate fallback → procedural
      if (tilemapReady()) {
        global.LunaciaTilemap.draw(ctx, W, H);
        // Soft/dim lane guides only — tilemap already has path/forest tiles
        ctx.strokeStyle = 'rgba(80,110,80,0.14)';
        ctx.lineWidth = LANE_PATH_W;
        ctx.lineCap = 'round';
        LANES.forEach((lane) => {
          ctx.beginPath();
          ctx.moveTo(PLAYER_BASE_X + 20, LANE_Y[lane]);
          ctx.lineTo(ENEMY_BASE_X - 20, LANE_Y[lane]);
          ctx.stroke();
        });
      } else if (mapReady()) {
        ctx.drawImage(mapImage, 0, 0, W, H);
        ctx.strokeStyle = 'rgba(80,110,80,0.18)';
        ctx.lineWidth = LANE_PATH_W;
        ctx.lineCap = 'round';
        LANES.forEach((lane) => {
          ctx.beginPath();
          ctx.moveTo(PLAYER_BASE_X + 20, LANE_Y[lane]);
          ctx.lineTo(ENEMY_BASE_X - 20, LANE_Y[lane]);
          ctx.stroke();
        });
      } else {
        ctx.fillStyle = '#1a2a1c';
        ctx.fillRect(0, 0, W, H);
        drawLaneGuides();
        drawTrees();
      }
      drawSanctuary('player');
      drawSanctuary('enemy');

      state.structures.forEach(drawStruct);
      // Enemy units outside vision are not drawn (terrain/structures show dimly through fog)
      const visions = visionSources();
      const seen = (x, y) => {
        for (const s of visions) {
          const dx = x - s.x;
          const dy = y - s.y;
          if (dx * dx + dy * dy <= s.r * s.r) return true;
        }
        return false;
      };
      for (const p of living(state.packs)) {
        if (p.team === 'enemy' && !seen(p.x, p.y)) continue;
        drawPack(p);
      }
      for (const a of living(state.axies)) {
        if (a.team === 'enemy' && !seen(a.x, a.y)) continue;
        drawAxie(a);
      }

      // Projectiles — trail + glow + core
      for (const p of state.projectiles) {
        if (p.trail) {
          for (const t of p.trail) {
            const a = clamp(t.life / (t.maxLife || 0.22), 0, 1);
            ctx.globalAlpha = a * 0.45;
            ctx.fillStyle = p.color;
            ctx.beginPath();
            ctx.arc(t.x, t.y, Math.max(1.5, t.r * a), 0, Math.PI * 2);
            ctx.fill();
          }
          ctx.globalAlpha = 1;
        }
        const glow = p.glow || 12;
        const g = ctx.createRadialGradient(p.x, p.y, 1, p.x, p.y, glow);
        g.addColorStop(0, p.color);
        g.addColorStop(0.35, p.color);
        g.addColorStop(1, 'rgba(0,0,0,0)');
        ctx.globalAlpha = 0.55;
        ctx.fillStyle = g;
        ctx.beginPath();
        ctx.arc(p.x, p.y, glow, 0, Math.PI * 2);
        ctx.fill();
        ctx.globalAlpha = 1;
        if (p.kind === 'bubble') {
          ctx.fillStyle = 'rgba(200,236,255,0.9)';
          ctx.beginPath();
          ctx.arc(p.x, p.y, p.r, 0, Math.PI * 2);
          ctx.fill();
          ctx.strokeStyle = p.color;
          ctx.lineWidth = 2;
          ctx.stroke();
          ctx.fillStyle = 'rgba(255,255,255,0.75)';
          ctx.beginPath();
          ctx.arc(p.x - p.r * 0.3, p.y - p.r * 0.35, p.r * 0.28, 0, Math.PI * 2);
          ctx.fill();
        } else {
          ctx.fillStyle = p.color;
          ctx.beginPath();
          ctx.arc(p.x, p.y, p.r, 0, Math.PI * 2);
          ctx.fill();
          ctx.fillStyle = 'rgba(255,255,255,0.55)';
          ctx.beginPath();
          ctx.arc(p.x - p.r * 0.25, p.y - p.r * 0.25, p.r * 0.35, 0, Math.PI * 2);
          ctx.fill();
        }
      }

      for (const f of state.fx) {
        const maxL = f.maxLife || 0.5;
        const tNorm = clamp(f.life / maxL, 0, 1);
        ctx.globalAlpha = clamp(tNorm * 1.35, 0, 1);
        if (f.spark) {
          ctx.fillStyle = f.color;
          ctx.beginPath();
          ctx.arc(f.x, f.y, f.r || 2, 0, Math.PI * 2);
          ctx.fill();
        } else if (f.ring && f.r) {
          const r0 = f.r0 != null ? f.r0 : f.r * 0.3;
          const rr = f.shock
            ? r0 + (f.r - r0) * (1 - tNorm)
            : f.r * (0.75 + 0.4 * (1 - tNorm));
          const arc = f.arc;
          let a0 = 0;
          let a1 = Math.PI * 2;
          if (arc) {
            const mid = arc.facingRight ? 0 : Math.PI;
            const half = arc.halfRad != null ? arc.halfRad : 1.0;
            a0 = mid - half;
            a1 = mid + half;
          }
          if (f.fill) {
            ctx.globalAlpha = clamp(tNorm * 0.28, 0, 0.35);
            ctx.fillStyle = f.color;
            ctx.beginPath();
            if (arc) {
              ctx.moveTo(f.x, f.y);
              ctx.arc(f.x, f.y, rr, a0, a1);
              ctx.closePath();
            } else {
              ctx.arc(f.x, f.y, rr, 0, Math.PI * 2);
            }
            ctx.fill();
            ctx.globalAlpha = clamp(tNorm * 1.2, 0, 1);
          }
          ctx.strokeStyle = f.color;
          ctx.lineWidth = f.lineW || 2.5;
          ctx.beginPath();
          ctx.arc(f.x, f.y, rr, a0, a1);
          ctx.stroke();
          // outer soft halo
          ctx.globalAlpha = clamp(tNorm * 0.35, 0, 0.4);
          ctx.lineWidth = (f.lineW || 2.5) + 3;
          ctx.beginPath();
          ctx.arc(f.x, f.y, rr + 3, a0, a1);
          ctx.stroke();
        }
        if (f.text) {
          ctx.globalAlpha = clamp(tNorm * 1.4, 0, 1);
          ctx.fillStyle = f.color;
          ctx.font = 'bold 12px sans-serif';
          ctx.textAlign = 'center';
          ctx.fillText(String(f.text), f.x, f.y);
        }
        ctx.globalAlpha = 1;
      }

      // Fog of War overlay (world space, under camera transform)
      drawFogOfWar(visions);

      // minimap-ish labels
      ctx.fillStyle = 'rgba(200,220,200,0.5)';
      ctx.font = '11px sans-serif';
      ctx.textAlign = 'left';
      const labelX = W / 2 - 12;
      ctx.fillText('TOP', labelX, LANE_Y.top - 36);
      ctx.fillText('MID', labelX, LANE_Y.mid - 36);
      ctx.fillText('BOT', labelX, LANE_Y.bot - 36);

      ctx.restore();
    }

    function loop(ts) {
      if (!state._last) state._last = ts;
      let dt = (ts - state._last) / 1000;
      state._last = ts;
      dt = Math.min(0.05, dt);
      update(dt);
      updateCamera(dt);
      render();
      requestAnimationFrame(loop);
    }

    /** Nearest living Den or Spire under cursor (Nest ignored). */
    function hitTestClickableStruct(wx, wy) {
      let best = null;
      let bestD = Infinity;
      for (const s of state.structures) {
        if (!s.alive) continue;
        if (s.team !== 'player') continue; // enemy Dens/Spires never clickable
        if (s.type !== 'den' && s.type !== 'spire') continue;
        const hitR = s.r + 14;
        const d = dist({ x: wx, y: wy }, s);
        if (d <= hitR && d < bestD) {
          best = s;
          bestD = d;
        }
      }
      return best;
    }

    /** True if selected living player Axie is within 2× structure radius. */
    function selectedAxieInStructRange(struct) {
      const ax = selected();
      if (!ax || !ax.alive || !struct) return false;
      return dist(ax, struct) <= struct.r * 2;
    }

    function onClick(ev) {
      if (!state.running || state.ended) return;
      if (ui.isDenModalOpen && ui.isDenModalOpen()) return;
      if (ui.isSpireModalOpen && ui.isSpireModalOpen()) return;
      const world = screenToWorld(ev.clientX, ev.clientY);
      const hit = hitTestClickableStruct(world.x, world.y);
      // Den/Spire modal only when selected living Axie is within 2 radii; else move-to-click.
      if (hit && selectedAxieInStructRange(hit)) {
        if (hit.type === 'den' && ui.openDenModal) ui.openDenModal(hit);
        else if (hit.type === 'spire' && ui.openSpireModal) ui.openSpireModal(hit);
        return;
      }
      const ax = selected();
      if (!ax || !ax.alive) return;
      ax.targetX = clamp(world.x, 20, W - 20);
      ax.targetY = clamp(world.y, 20, H - 20);
    }

    function onKey(ev) {
      if (ev.key === 'Shift') {
        state.zoomOutHeld = true;
        return;
      }
      if (ev.key === 'Escape') {
        if (ui.closeDenModal) ui.closeDenModal();
        if (ui.closeSpireModal) ui.closeSpireModal();
        return;
      }
      const k = ev.key;
      if (k === 'Tab') {
        ev.preventDefault(); // stop browser focus steal
        cycleAxie();
        return;
      }
      if (k === '1') selectAxie(0);
      if (k === '2') selectAxie(1);
      if (k === '3') selectAxie(2);
      const ax = selected();
      if (!ax) return;
      const up = k.toUpperCase();
      if (['Q', 'W', 'E', 'R'].includes(up)) castSkill(ax, up);
      // Lane reassign hotkeys at Sanctuary: Z X C -> top mid bot
      if (k === 'z' || k === 'Z') startLaneChannel('top');
      if (k === 'x' || k === 'X') startLaneChannel('mid');
      if (k === 'c' || k === 'C') startLaneChannel('bot');
    }

    function onKeyUp(ev) {
      if (ev.key === 'Shift') state.zoomOutHeld = false;
    }

    function onBlur() {
      state.zoomOutHeld = false;
    }

    function start() {
      state.running = true;
      state.ended = false;
      spawnPackWave();
      log('Match start — command your Axies. Destroy two inner Spires to expose the Nest.');
      if (ui.renderAxies) ui.renderAxies(state);
      if (ui.renderSkills) ui.renderSkills(selected());
      if (ui.renderShop) ui.renderShop(state);
      if (ui.renderDens) ui.renderDens(state);
      if (ui.renderHud) ui.renderHud(state);
    }

    canvas.addEventListener('click', onClick);
    window.addEventListener('keydown', onKey);
    window.addEventListener('keyup', onKeyUp);
    window.addEventListener('blur', onBlur);
    requestAnimationFrame(loop);

    // Seed camera on first selected Axie
    {
      const ax = selected();
      if (ax) {
        state.cam.x = ax.x;
        state.cam.y = ax.y;
        state.cam.zoom = ZOOM_IN;
      }
    }

    return {
      state,
      start,
      selectAxie,
      cycleAxie,
      buyItem,
      upgradeDen,
      breedDenPacks,
      repairSpire,
      upgradeSpire,
      startLaneChannel,
      selected,
      setZoomOutHeld,
      denUpgradeCost,
      denFor,
      spireFor,
      spireRepairCost,
      spireRepairAmount,
      spireUpgradeCost,
      spireLabel,
      DEN_MAX_LEVEL,
      DEN_UPGRADE_COST,
      BREED_PACK_COST,
      PACK_CLASS_IDS,
      packSpecies,
      species,
      packSpeciesName,
      packSpeciesDef,
      speciesDef,
      classIdForStarter,
      properClassName,
      classMult,
      SPIRE_MAX_LEVEL,
      SPIRE_UPGRADE_COST,
      AXIE_MAX_LEVEL,
      LEVEL_BONUS,
      ZOOM_IN,
      ZOOM_OUT,
      FOG_VISION_AXIE,
      FOG_VISION_PACK,
      FOG_VISION_SPIRE,
      FOG_VISION_DEN,
      FOG_VISION_NEST,
      W, H,
      starters,
    };
  }

  global.LunaciaRift = { createGame, loadGameContract, applyGameContract, GAME_CONTRACT_URL };
})(typeof window !== 'undefined' ? window : globalThis);
