/**
 * Origins Battle Kit web-vfx — canvas-only additive atlas playback.
 * Ported from axie-origins-asset-kit/web-vfx (clip.ts + aquaticSlash drawCanvas path).
 * No Pixi dependency. Relative asset base for python -m http.server and Vite.
 *
 * License: Vibeathon-only — see assets/origins-vfx/NOTICE.md
 */

/** @typedef {{ x: number, y: number }} Point */
/** @typedef {{ attacker: Point, defender: Point, fieldWidth: number }} Anchors */
/** @typedef {{ time: number, function: string, string?: string|null, float?: number|null }} ClipEvent */

export const VFX_BASE = 'assets/origins-vfx';
export const SFX_BASE = 'assets/origins-sfx';

/** Starter QWER → clip ids */
export const CLIP_MAP = {
  buba: { Q: 'plant_bite', W: 'plant_slash', E: 'shield', R: 'plant_smash' },
  olek: { Q: 'beast_bite', W: 'beast_gore', E: 'beast_cast', R: 'beast_smash' },
  puffy: { Q: 'aquatic_projectile', W: 'aquatic_slash', E: 'aquatic_cast', R: 'aquatic_smash' },
};

/** Optional SFX keyed by clip id (attack wav when present). */
const SFX_MAP = {
  plant_bite: 'plant_bite_attack.wav',
  plant_slash: 'plant_slash_attack.wav',
  plant_smash: 'plant_smash_attack.wav',
  plant_cast: 'plant_cast_attack.wav',
  shield: 'shield.wav',
  beast_bite: 'beast_bite_attack.wav',
  beast_gore: 'beast_gore_attack.wav',
  beast_cast: 'beast_cast_attack.wav',
  beast_smash: 'beast_smash_attack.wav',
  aquatic_projectile: 'aquatic_projectile_attack.wav',
  aquatic_slash: 'aquatic_slash_attack.wav',
  aquatic_cast: 'aquatic_cast_attack.wav',
  aquatic_smash: 'aquatic_smash_attack.wav',
};

/** Uniform downscale so Origins capture frames fit ~48px Canvas heroes. */
const VFX_WORLD_SCALE = 0.28;

const clipCache = new Map();
const atlasCache = new Map();
/** @type {Array<{ atlas: AdditiveAtlas, started: number, getAnchors: () => Anchors, loop: boolean, fired: Set<string>, onDone?: () => void }>} */
const active = [];

let overlay = null;
let octx = null;
let gameRef = null;
let gameCanvas = null;
let rafId = 0;
let running = false;

function loadImage(url) {
  return new Promise((resolve, reject) => {
    const img = new Image();
    img.onload = () => resolve(img);
    img.onerror = () => reject(new Error(`Failed to load ${url}`));
    img.src = url;
  });
}

export function frameAt(clip, time) {
  return Math.min(clip.frames - 1, Math.max(0, Math.floor(time * clip.fps)));
}

export function clipUrl(id) {
  return `${VFX_BASE}/${encodeURIComponent(id)}/clip.json`;
}

export function atlasUrl(clip) {
  return `${VFX_BASE}/${encodeURIComponent(clip.id)}/${clip.atlas.file}`;
}

export async function loadClip(id) {
  if (clipCache.has(id)) return clipCache.get(id);
  const res = await fetch(clipUrl(id));
  if (!res.ok) throw new Error(`Failed to load clip ${id}`);
  const clip = await res.json();
  clipCache.set(id, clip);
  return clip;
}

export class AdditiveAtlas {
  /**
   * @param {any} clip
   * @param {HTMLImageElement} image
   */
  constructor(clip, image) {
    this.clip = clip;
    this.image = image;
  }

  static async load(clip) {
    const key = clip.id;
    if (atlasCache.has(key)) return atlasCache.get(key);
    const image = await loadImage(atlasUrl(clip));
    const atlas = new AdditiveAtlas(clip, image);
    atlasCache.set(key, atlas);
    return atlas;
  }

  drawCanvas(ctx, index, x, y, scaleX, scaleY, originX, originY) {
    const { cols, frameW, frameH } = this.clip.atlas;
    const col = index % cols;
    const row = Math.floor(index / cols);
    ctx.save();
    ctx.translate(x, y);
    ctx.scale(scaleX, scaleY);
    ctx.drawImage(
      this.image,
      col * frameW,
      row * frameH,
      frameW,
      frameH,
      -originX,
      -originY,
      frameW,
      frameH,
    );
    ctx.restore();
  }
}

export function mapCaptureToField(clip, anchors) {
  const { attacker, defender, fieldWidth } = anchors;
  const cdx = clip.captureDefender.x - clip.captureAttacker.x;
  const jdx = defender.x - attacker.x;
  const captureSpan = Math.abs(cdx) > 8 ? Math.abs(cdx) : 390;
  const spanScale = Math.abs(jdx) > 8 ? Math.abs(jdx) / captureSpan : 0.6;
  const fitScale = fieldWidth > 0 ? (fieldWidth * 0.55) / clip.atlas.frameW : spanScale;
  let scale = Math.min(Math.max(0.22, spanScale), Math.max(0.22, fitScale));
  scale *= VFX_WORLD_SCALE;
  const flip = Math.sign(jdx || 1) !== Math.sign(cdx || -1);
  return { scale, flip, defender };
}

export function cropPointToField(clip, map, px, py) {
  const dx = px - clip.anchor.x;
  const dy = py - clip.anchor.y;
  const sx = map.flip ? -map.scale : map.scale;
  return {
    x: map.defender.x + dx * sx,
    y: map.defender.y + dy * map.scale,
  };
}

function ensureOverlay(canvas) {
  if (overlay && overlay.isConnected) return overlay;
  const wrap = canvas.parentElement;
  overlay = document.getElementById('origins-vfx-overlay');
  if (!overlay) {
    overlay = document.createElement('canvas');
    overlay.id = 'origins-vfx-overlay';
    overlay.setAttribute('aria-hidden', 'true');
    if (wrap) wrap.appendChild(overlay);
    else canvas.insertAdjacentElement('afterend', overlay);
  }
  overlay.width = canvas.width;
  overlay.height = canvas.height;
  octx = overlay.getContext('2d');
  return overlay;
}

function pinOverlay() {
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

function playSfx(clipId) {
  const file = SFX_MAP[clipId];
  if (!file) return;
  try {
    const a = new Audio(`${SFX_BASE}/${file}`);
    a.volume = 0.45;
    a.play().catch(() => {});
  } catch (_) { /* ignore */ }
}

function tick() {
  if (!running) return;
  rafId = requestAnimationFrame(tick);
  if (!octx || !overlay || !gameRef) return;
  pinOverlay();

  const W = gameRef.W || overlay.width;
  const H = gameRef.H || overlay.height;
  const cam = gameRef.state && gameRef.state.cam;
  if (!cam) return;

  octx.setTransform(1, 0, 0, 1, 0, 0);
  octx.clearRect(0, 0, overlay.width, overlay.height);

  if (!active.length) return;

  // Same camera transform as game.js render()
  octx.save();
  octx.translate(W / 2, H / 2);
  octx.scale(cam.zoom, cam.zoom);
  octx.translate(-cam.x, -cam.y);
  // Additive look comes from CSS mix-blend-mode: plus-lighter on the overlay
  octx.globalCompositeOperation = 'source-over';

  const now = performance.now();
  const remain = [];
  for (const play of active) {
    const clip = play.atlas.clip;
    const elapsed = (now - play.started) / 1000;
    const t = play.loop ? elapsed % clip.duration : Math.min(clip.duration, elapsed);
    const index = frameAt(clip, t);
    const map = mapCaptureToField(clip, play.getAnchors());
    const origin = clip.anchor;
    const pos = cropPointToField(clip, map, origin.x, origin.y);
    play.atlas.drawCanvas(
      octx,
      index,
      pos.x,
      pos.y,
      map.flip ? -map.scale : map.scale,
      map.scale,
      origin.x,
      origin.y,
    );
    if (!play.loop && elapsed >= clip.duration) {
      try { play.onDone && play.onDone(); } catch (_) { /* */ }
    } else {
      remain.push(play);
    }
  }
  active.length = 0;
  active.push(...remain);
  octx.restore();
}

/**
 * @param {AdditiveAtlas} atlas
 * @param {() => Anchors} getAnchors
 * @param {{ loop?: boolean, onDone?: () => void }} [opts]
 */
export function playOnOverlay(atlas, getAnchors, opts = {}) {
  const play = {
    atlas,
    started: performance.now(),
    getAnchors,
    loop: !!opts.loop,
    fired: new Set(),
    onDone: opts.onDone,
  };
  active.push(play);
  return {
    stop() {
      const i = active.indexOf(play);
      if (i >= 0) active.splice(i, 1);
    },
  };
}

/**
 * Resolve clip id for a starter + skill key.
 * @param {string} defId
 * @param {string} key
 */
export function clipForSkill(defId, key) {
  const row = CLIP_MAP[defId];
  return row ? row[key] || null : null;
}

/**
 * Play Origins VFX for a cast. Anchors in world space; overlay applies camera.
 * @param {*} axie
 * @param {string} key
 * @param {{ x: number, y: number }|null} defenderWorld
 */
export async function playSkillVfx(axie, key, defenderWorld) {
  if (!axie) return null;
  const id = clipForSkill(axie.defId, key);
  if (!id) return null;
  try {
    const clip = await loadClip(id);
    const atlas = await AdditiveAtlas.load(clip);
    const facing = axie.facingRight ? 1 : -1;
    const atk = { x: axie.x, y: axie.y };
    let def = defenderWorld;
    if (!def) {
      // Point ahead of facing when no foe (buffs / miss)
      def = { x: axie.x + facing * 70, y: axie.y };
    }
    // Self-buffs: keep defender near caster so atlas stays on the Axie
    if (key === 'E' || (clip.kind === 'buff')) {
      def = { x: axie.x + facing * 8, y: axie.y - 6 };
    }
    const fieldWidth = 220; // local combat span in world px (heroes are small)
    playSfx(id);
    return playOnOverlay(atlas, () => ({
      attacker: { x: axie.x, y: axie.y },
      defender: key === 'E' || clip.kind === 'buff'
        ? { x: axie.x + (axie.facingRight ? 8 : -8), y: axie.y - 6 }
        : (defenderWorld || { x: axie.x + (axie.facingRight ? 1 : -1) * 70, y: axie.y }),
      fieldWidth,
    }));
  } catch (err) {
    console.warn('[OriginsVfx] play failed', id, err);
    return null;
  }
}

/**
 * Preload starter clips used by Buba/Olek/Puffy QWER.
 */
export async function preloadStarterClips() {
  const ids = new Set();
  Object.values(CLIP_MAP).forEach((row) => {
    Object.values(row).forEach((id) => ids.add(id));
  });
  const list = [...ids];
  await Promise.all(
    list.map(async (id) => {
      try {
        const clip = await loadClip(id);
        await AdditiveAtlas.load(clip);
      } catch (err) {
        console.warn('[OriginsVfx] preload miss', id, err && err.message);
      }
    }),
  );
  return list;
}

/**
 * Attach overlay + RAF loop to a LunaciaRift game instance.
 * @param {*} game
 * @param {HTMLCanvasElement} canvas
 */
export async function attachOriginsVfx(game, canvas) {
  gameRef = game;
  gameCanvas = canvas;
  ensureOverlay(canvas);
  pinOverlay();
  if (!running) {
    running = true;
    rafId = requestAnimationFrame(tick);
  }
  const api = {
    ready: true,
    playSkillVfx,
    playOnOverlay,
    loadClip,
    AdditiveAtlas,
    preloadStarterClips,
    clipForSkill,
    CLIP_MAP,
    VFX_BASE,
    destroy() {
      running = false;
      cancelAnimationFrame(rafId);
      active.length = 0;
      if (octx && overlay) {
        octx.setTransform(1, 0, 0, 1, 0, 0);
        octx.clearRect(0, 0, overlay.width, overlay.height);
      }
      window.OriginsVfx = null;
    },
  };
  window.OriginsVfx = api;
  try {
    document.body.dataset.originsVfxReady = '1';
  } catch (_) { /* */ }
  // Fire-and-forget preload
  preloadStarterClips().then((ids) => {
    try {
      document.body.dataset.originsVfxPreloaded = String(ids.length);
    } catch (_) { /* */ }
  });
  return api;
}

export default { attachOriginsVfx, playSkillVfx, CLIP_MAP, VFX_BASE };
