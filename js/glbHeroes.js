/**
 * Three.js GLB hero overlay — kit mascot stand-ins for Buba / Olek / Puffy.
 *
 * Mapping (no official starter GLBs in the Builder Kit):
 *   buba  → assets/glb/paladill.glb  (Idle / Walk / Hammer.Attack / Hammer.Skill)
 *   olek  → assets/glb/pomodoro.glb  (Idle / Walk / Staff.Attack / Staff.Skill)
 *   puffy → assets/glb/bing.glb      (prefer Cannon.* when present)
 *
 * Feature flag: window.USE_GLB_HEROES (default false). Opt-in with ?glb=1
 * Failures fall back to Canvas PNG heroes. USE_SPINE_HEROES stays false.
 *
 * Rights: assets/glb/RIGHTS.md + NOTICE.md — Vibeathon / approved Axie use only.
 */

import * as THREE from 'three';
import { GLTFLoader } from 'three/addons/loaders/GLTFLoader.js';

const W = 1500;
const H = 800;

/**
 * Target hero height in **game world** units (matches SPRITE_DRAW_W ≈ 48).
 * On screen ≈ 48 × cam.zoom px (~130px at ZOOM_IN 2.7). Clamped feel: ~48–64 world.
 */
export const TARGET_WORLD_PX = 56;

const CROSSFADE = 0.15;
const MOVE_SPEED_THRESH = 18; // world units / sec
const GLB_BASE = 'assets/glb';

/**
 * @typedef {{
 *   file: string,
 *   idle: string,
 *   walk: string,
 *   attack: string,
 *   skill: string,
 *   idleFallback?: string,
 *   walkFallback?: string,
 *   attackFallback?: string,
 *   skillFallback?: string,
 * }} HeroClipMap
 */

/** @type {Record<string, HeroClipMap>} */
export const HERO_MAP = {
  buba: {
    file: 'paladill.glb',
    idle: 'Idle',
    walk: 'Walk',
    attack: 'Hammer.Attack',
    skill: 'Hammer.Skill',
  },
  olek: {
    file: 'pomodoro.glb',
    idle: 'Idle',
    walk: 'Walk',
    attack: 'Staff.Attack',
    skill: 'Staff.Skill',
  },
  puffy: {
    file: 'bing.glb',
    idle: 'Cannon.Idle',
    walk: 'Cannon.Walk',
    attack: 'Cannon.Attack',
    skill: 'Cannon.Skill',
    idleFallback: 'Idle',
    walkFallback: 'Walk',
    attackFallback: 'Idle',
    skillFallback: 'Idle',
  },
};

function parseFlag() {
  if (typeof window === 'undefined') return false;
  if (window.USE_GLB_HEROES === true) return true;
  try {
    const q = new URLSearchParams(window.location.search);
    const v = q.get('glb');
    if (v === '1' || v === 'true' || v === 'on') return true;
    if (v === '0' || v === 'false' || v === 'off') return false;
  } catch (_) { /* ignore */ }
  return false;
}

/**
 * @param {Map<string, THREE.AnimationClip>} byName
 * @param {...(string|null|undefined)} names
 */
function pickClip(byName, ...names) {
  for (const n of names) {
    if (n && byName.has(n)) return byName.get(n);
  }
  const lower = new Map([...byName.keys()].map((k) => [k.toLowerCase(), byName.get(k)]));
  for (const n of names) {
    if (n && lower.has(String(n).toLowerCase())) return lower.get(String(n).toLowerCase());
  }
  return null;
}

function ensureOverlay(gameCanvas) {
  let el = document.getElementById('glb-overlay');
  const wrap = gameCanvas.parentElement;
  if (!el) {
    el = document.createElement('canvas');
    el.id = 'glb-overlay';
    el.setAttribute('aria-hidden', 'true');
    if (wrap) {
      const vfx = document.getElementById('origins-vfx-overlay');
      if (vfx && vfx.parentElement === wrap) wrap.insertBefore(el, vfx);
      else wrap.appendChild(el);
    } else {
      gameCanvas.insertAdjacentElement('afterend', el);
    }
  }
  el.width = gameCanvas.width;
  el.height = gameCanvas.height;
  return el;
}

function pinOverlay(overlay, gameCanvas) {
  if (!overlay || !gameCanvas) return;
  const wrapEl = gameCanvas.parentElement;
  const g = gameCanvas.getBoundingClientRect();
  const w = wrapEl ? wrapEl.getBoundingClientRect() : g;
  overlay.style.left = `${g.left - w.left}px`;
  overlay.style.top = `${g.top - w.top}px`;
  overlay.style.width = `${g.width}px`;
  overlay.style.height = `${g.height}px`;
  if (overlay.width !== gameCanvas.width || overlay.height !== gameCanvas.height) {
    overlay.width = gameCanvas.width;
    overlay.height = gameCanvas.height;
  }
}

/**
 * Sync ortho frustum to game.js camera (Y-down, same as canvas).
 * @param {THREE.OrthographicCamera} camera
 * @param {{ x: number, y: number, zoom: number }} cam
 * @param {number} width
 * @param {number} height
 */
function syncCamera(camera, cam, width, height) {
  const z = Math.max(0.01, cam.zoom || 1);
  const halfW = width / (2 * z);
  const halfH = height / (2 * z);
  camera.left = cam.x - halfW;
  camera.right = cam.x + halfW;
  camera.top = cam.y - halfH; // smaller y = top of screen
  camera.bottom = cam.y + halfH;
  camera.near = -500;
  camera.far = 500;
  camera.position.set(0, 0, 10);
  camera.rotation.set(0, 0, 0);
  camera.updateProjectionMatrix();
}

/**
 * @param {*} game
 * @param {HTMLCanvasElement} gameCanvas
 */
export async function attachGlbHeroes(game, gameCanvas) {
  if (!parseFlag()) {
    console.info('[GlbHeroes] disabled (?glb=0 or USE_GLB_HEROES=false)');
    return null;
  }

  const overlay = ensureOverlay(gameCanvas);
  const renderer = new THREE.WebGLRenderer({
    canvas: overlay,
    alpha: true,
    antialias: true,
    premultipliedAlpha: false,
  });
  renderer.setClearColor(0x000000, 0);
  renderer.setPixelRatio(Math.min(window.devicePixelRatio || 1, 2));
  renderer.setSize(gameCanvas.width, gameCanvas.height, false);
  renderer.outputColorSpace = THREE.SRGBColorSpace;

  const camera = new THREE.OrthographicCamera(0, W, 0, H, -500, 500);
  const scene = new THREE.Scene();
  scene.add(new THREE.AmbientLight(0xffffff, 1.2));
  const key = new THREE.DirectionalLight(0xfff0e0, 1.4);
  key.position.set(40, -80, 120);
  scene.add(key);
  const fill = new THREE.DirectionalLight(0xc8e0ff, 0.6);
  fill.position.set(-60, 50, 90);
  scene.add(fill);

  const loader = new GLTFLoader();
  /** @type {Map<string, any>} */
  const heroes = new Map();
  const clock = new THREE.Clock();

  /**
   * @param {HeroClipMap} map
   * @param {THREE.AnimationClip[]} clips
   */
  function resolveClips(map, clips) {
    const byName = new Map(clips.map((c) => [c.name, c]));
    const idle = pickClip(
      byName,
      map.idle,
      map.idleFallback,
      'Idle',
      'Cannon.Idle',
      'Hammer.Idle',
      'Staff.Idle',
    );
    const walk = pickClip(
      byName,
      map.walk,
      map.walkFallback,
      'Walk',
      'Cannon.Walk',
      'Hammer.Walk',
      'Staff.Walk',
      'Run',
    );
    const attack = pickClip(
      byName,
      map.attack,
      map.attackFallback,
      'Hammer.Attack',
      'Staff.Attack',
      'Cannon.Attack',
      'Attack',
    );
    const skill = pickClip(
      byName,
      map.skill,
      map.skillFallback,
      'Hammer.Skill',
      'Staff.Skill',
      'Cannon.Skill',
      attack ? attack.name : null,
    );
    return { idle, walk, attack, skill };
  }

  async function loadHero(axie) {
    const map = HERO_MAP[axie.defId];
    if (!map) return null;
    const url = `${GLB_BASE}/${map.file}`;
    let gltf;
    try {
      gltf = await loader.loadAsync(url);
    } catch (err) {
      console.warn('[GlbHeroes] load failed', url, err);
      return null;
    }

    const root = new THREE.Group();
    const model = gltf.scene;
    root.add(model);

    // Center model, then scale so max dimension ≈ TARGET_WORLD_PX
    const box = new THREE.Box3().setFromObject(model);
    const size = new THREE.Vector3();
    const center = new THREE.Vector3();
    box.getSize(size);
    box.getCenter(center);
    model.position.sub(center);
    // Nudge so feet sit near axie.y (HP bar stays on main canvas above)
    model.position.y += size.y * 0.05;

    const maxDim = Math.max(size.x, size.y, size.z, 0.001);
    const baseScale = TARGET_WORLD_PX / maxDim;
    root.scale.set(baseScale, baseScale, baseScale);
    // Y-down world: flip X-axis rotation so Y-up meshes read upright
    root.rotation.x = Math.PI;

    scene.add(root);

    const mixer = new THREE.AnimationMixer(model);
    const resolved = resolveClips(map, gltf.animations || []);
    /** @type {Record<string, THREE.AnimationAction|null>} */
    const actions = {
      idle: resolved.idle ? mixer.clipAction(resolved.idle) : null,
      walk: resolved.walk ? mixer.clipAction(resolved.walk) : null,
      attack: resolved.attack ? mixer.clipAction(resolved.attack) : null,
      skill: resolved.skill ? mixer.clipAction(resolved.skill) : null,
    };
    Object.values(actions).forEach((a) => {
      if (!a) return;
      a.enabled = true;
      a.setEffectiveTimeScale(1);
      a.setEffectiveWeight(1);
    });
    if (actions.attack) {
      actions.attack.setLoop(THREE.LoopOnce, 1);
      actions.attack.clampWhenFinished = true;
    }
    if (actions.skill) {
      actions.skill.setLoop(THREE.LoopOnce, 1);
      actions.skill.clampWhenFinished = true;
    }

    /** @type {THREE.AnimationAction|null} */
    let current = null;
    function fadeTo(next, fade = CROSSFADE) {
      if (!next) return;
      if (current === next && next.isRunning()) return;
      next.setLoop(THREE.LoopRepeat, Infinity);
      next.reset();
      next.play();
      if (current && current !== next) current.crossFadeTo(next, fade, false);
      else next.fadeIn(fade);
      current = next;
    }

    if (actions.idle) fadeTo(actions.idle, 0);

    const hero = {
      axieId: axie.id,
      defId: axie.defId,
      root,
      model,
      mixer,
      actions,
      get current() {
        return current;
      },
      set current(v) {
        current = v;
      },
      fadeTo,
      baseScale,
      oneshotUntil: 0,
      oneshotKind: /** @type {string|null} */ (null),
      lastX: axie.x,
      lastY: axie.y,
      clipNames: {
        idle: resolved.idle && resolved.idle.name,
        walk: resolved.walk && resolved.walk.name,
        attack: resolved.attack && resolved.attack.name,
        skill: resolved.skill && resolved.skill.name,
      },
    };

    mixer.addEventListener('finished', (e) => {
      if (!hero.oneshotKind) return;
      if (e.action === actions.attack || e.action === actions.skill) {
        hero.oneshotKind = null;
        hero.oneshotUntil = 0;
      }
    });

    heroes.set(axie.id, hero);
    return hero;
  }

  const axies = (game.state && game.state.axies) || [];
  await Promise.all(
    axies
      .filter((a) => HERO_MAP[a.defId])
      .map((a) =>
        loadHero(a).catch((e) => {
          console.warn('[GlbHeroes] build failed', a.id, e);
          return null;
        }),
      ),
  );

  if (heroes.size === 0) {
    console.warn('[GlbHeroes] no heroes loaded — PNG fallback');
    try {
      renderer.dispose();
    } catch (_) { /* */ }
    return null;
  }

  function playAttack(axie, key) {
    if (!axie) return false;
    const hero = heroes.get(axie.id);
    if (!hero) return false;
    const k = String(key || '').toUpperCase();
    // E soft: no heavy oneshot (self-buff / shield)
    if (k === 'E') return false;
    const action = k === 'R' ? hero.actions.skill : hero.actions.attack;
    if (!action) return false;
    hero.oneshotKind = k === 'R' ? 'skill' : 'attack';
    const dur = action.getClip() ? action.getClip().duration : 0.6;
    hero.oneshotUntil = performance.now() + dur * 1000 + 50;
    action.reset();
    action.setEffectiveWeight(1);
    action.play();
    if (hero.current && hero.current !== action) {
      hero.current.crossFadeTo(action, CROSSFADE, false);
    } else {
      action.fadeIn(CROSSFADE);
    }
    hero.current = action;
    return true;
  }

  function syncFromGame(dt) {
    const st = game.state;
    if (!st || !st.cam) return;
    pinOverlay(overlay, gameCanvas);
    const cw = gameCanvas.width || W;
    const ch = gameCanvas.height || H;
    if (overlay.width !== cw || overlay.height !== ch) {
      overlay.width = cw;
      overlay.height = ch;
    }
    renderer.setSize(cw, ch, false);
    syncCamera(camera, st.cam, cw, ch);

    const now = performance.now();

    for (const a of st.axies || []) {
      const hero = heroes.get(a.id);
      if (!hero) continue;
      if (!a.alive) {
        hero.root.visible = false;
        continue;
      }
      hero.root.visible = true;

      // World position (camera frustum handles zoom/follow)
      hero.root.position.set(a.x, a.y, 0);
      const s = hero.baseScale;
      // Flip for facingRight (PNG art faces left; GLB faces camera — mirror X)
      const face = a.facingRight ? 1 : -1;
      hero.root.scale.set(face * s, s, s);

      const inOneshot = !!(hero.oneshotKind && now < hero.oneshotUntil);
      if (!inOneshot) {
        if (hero.oneshotKind && now >= hero.oneshotUntil) hero.oneshotKind = null;
        const dx = a.x - hero.lastX;
        const dy = a.y - hero.lastY;
        const spd = dt > 0 ? Math.hypot(dx, dy) / dt : 0;
        const moving = spd > MOVE_SPEED_THRESH;
        if (moving && hero.actions.walk) hero.fadeTo(hero.actions.walk);
        else if (hero.actions.idle) hero.fadeTo(hero.actions.idle);
      }
      hero.lastX = a.x;
      hero.lastY = a.y;
      hero.mixer.update(dt);
    }
  }

  let running = true;
  let rafId = 0;
  function tick() {
    if (!running) return;
    rafId = requestAnimationFrame(tick);
    const dt = Math.min(0.05, clock.getDelta());
    syncFromGame(dt);
    renderer.render(scene, camera);
  }
  tick();

  const api = {
    ready: true,
    hideCanvasHeroes: true,
    targetWorldPx: TARGET_WORLD_PX,
    /** @deprecated alias — same constant used as ~56 world-px height */
    targetScreenPx: TARGET_WORLD_PX,
    heroes,
    playAttack,
    hasHero(id) {
      return heroes.has(id);
    },
    destroy() {
      running = false;
      cancelAnimationFrame(rafId);
      heroes.forEach((h) => {
        scene.remove(h.root);
        h.mixer.stopAllAction();
      });
      heroes.clear();
      try {
        renderer.dispose();
      } catch (_) { /* */ }
      window.GlbHeroes = null;
    },
  };

  window.GlbHeroes = api;
  try {
    document.body.dataset.glbHeroesReady = '1';
    document.body.dataset.glbHeroesCount = String(heroes.size);
  } catch (_) { /* */ }

  const summary = [...heroes.values()]
    .map((h) => `${h.defId}:{${h.clipNames.idle}/${h.clipNames.walk}/${h.clipNames.attack}}`)
    .join(', ');
  console.info(`[GlbHeroes] ready ×${heroes.size} @ ${TARGET_WORLD_PX} world-px — ${summary}`);
  return api;
}

export default { attachGlbHeroes, HERO_MAP, TARGET_WORLD_PX };
