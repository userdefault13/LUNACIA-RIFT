/**
 * Round 1 hero Spine attack spike — Axie Mixer + Pixi overlay.
 *
 * GENE SOURCE: sample / demo genes (stand-ins). Buba / Olek / Puffy are fixed
 * starter mascots, not Mixer gene Axies. Real starter genes are unknown here;
 * we use Mixer sample hexes so attack/melee/tail-smash and attack/ranged/cast-fly
 * can play on QWER. Documented for BYOA Round 2.
 *
 * Feature flag: window.USE_SPINE_HEROES (default false). Opt-in with ?spine=1
 * or set window.USE_SPINE_HEROES = true before boot.
 *
 * Animations used:
 *   - action/idle/normal
 *   - attack/melee/tail-smash   (melee-ish skills)
 *   - attack/ranged/cast-fly    (Puffy Q / ranged)
 */

const AXIE_IMAGES_URL = 'https://axiecdn.axieinfinity.com/mixer-stuffs/v6/';

/** Mixer docs sample genes — stand-in for all three starters (not real Buba/Olek/Puffy). */
const SAMPLE_GENES =
  '0x20000000000003000181a09082040000000100040800800400000090086044020001000010008002000100100840450200010004186044020001001008808404';

const STARTER_GENES = {
  buba: SAMPLE_GENES,
  olek: SAMPLE_GENES,
  puffy: SAMPLE_GENES,
};

const ANIM = {
  idle: 'action/idle/normal',
  melee: 'attack/melee/tail-smash',
  ranged: 'attack/ranged/cast-fly',
};

const SPINE_SCALE = 0.11;

function parseFlag() {
  if (typeof window === 'undefined') return false;
  if (window.USE_SPINE_HEROES === true) return true;
  try {
    const q = new URLSearchParams(window.location.search);
    if (q.get('spine') === '1' || q.get('spine') === 'true') return true;
  } catch (_) { /* ignore */ }
  return false;
}

async function loadMixerStack() {
  // Prefer Vite/bundled packages when present; else esm.sh CDN + vendored JSON.
  try {
    const mixer = await import('@axieinfinity/mixer');
    const PIXI = await import('pixi.js');
    const spineMod = await import('pixi-spine');
    const runtime = await import('@pixi-spine/runtime-3.8');
    const GenesData = (await import('@axieinfinity/mixer/dist/data/axie-2d-v3-stuff-genes.json')).default;
    const SamplesData = (await import('@axieinfinity/mixer/dist/data/axie-2d-v3-stuff-samples.json')).default;
    const VariantsData = (await import('@axieinfinity/mixer/dist/data/axie-2d-v3-stuff-variant.json')).default;
    const AnimationsData = (await import('@axieinfinity/mixer/dist/data/axie-2d-v3-stuff-animations.json')).default;
    return {
      source: 'bundled',
      mixer,
      Application: PIXI.Application,
      Assets: PIXI.Assets,
      Texture: PIXI.Texture,
      Spine: spineMod.Spine,
      TextureAtlas: spineMod.TextureAtlas,
      AtlasAttachmentLoader: runtime.AtlasAttachmentLoader,
      SkeletonJson: runtime.SkeletonJson,
      GenesData,
      SamplesData,
      VariantsData,
      AnimationsData,
    };
  } catch (bundledErr) {
    console.info('[SpineHeroes] bundled packages missing, using esm.sh CDN', bundledErr && bundledErr.message ? bundledErr.message : bundledErr);
  }

  const mixer = await import('https://esm.sh/@axieinfinity/mixer@1.4.9');
  const PIXI = await import('https://esm.sh/pixi.js@7.2.4');
  const spineMod = await import('https://esm.sh/pixi-spine@4.0.3?deps=pixi.js@7.2.4');
  const runtime = await import('https://esm.sh/@pixi-spine/runtime-3.8@4.0.3');

  async function loadJson(localPath, remoteUrl) {
    try {
      const r = await fetch(localPath);
      if (r.ok) return r.json();
    } catch (_) { /* fall through */ }
    const r2 = await fetch(remoteUrl);
    if (!r2.ok) throw new Error('Failed to load ' + remoteUrl);
    return r2.json();
  }

  const baseVendor = 'vendor/mixer/dist/data';
  const baseRemote = 'https://unpkg.com/@axieinfinity/mixer@1.4.9/dist/data';
  const [GenesData, SamplesData, VariantsData, AnimationsData] = await Promise.all([
    loadJson(baseVendor + '/axie-2d-v3-stuff-genes.json', baseRemote + '/axie-2d-v3-stuff-genes.json'),
    loadJson(baseVendor + '/axie-2d-v3-stuff-samples.json', baseRemote + '/axie-2d-v3-stuff-samples.json'),
    loadJson(baseVendor + '/axie-2d-v3-stuff-variant.json', baseRemote + '/axie-2d-v3-stuff-variant.json'),
    loadJson(baseVendor + '/axie-2d-v3-stuff-animations.json', baseRemote + '/axie-2d-v3-stuff-animations.json'),
  ]);

  return {
    source: 'cdn',
    mixer,
    Application: PIXI.Application,
    Assets: PIXI.Assets,
    Texture: PIXI.Texture,
    Spine: spineMod.Spine,
    TextureAtlas: spineMod.TextureAtlas,
    AtlasAttachmentLoader: runtime.AtlasAttachmentLoader,
    SkeletonJson: runtime.SkeletonJson,
    GenesData,
    SamplesData,
    VariantsData,
    AnimationsData,
  };
}

function skillKind(axie, key) {
  if (axie && axie.defId === 'puffy' && key === 'Q') return 'ranged';
  return 'melee';
}

/**
 * @param {object} game - LunaciaRift createGame() return value
 * @param {HTMLCanvasElement} gameCanvas
 */
export async function attachSpineHeroes(game, gameCanvas) {
  if (!parseFlag()) {
    console.info('[SpineHeroes] disabled (default; use ?spine=1 to enable)');
    return null;
  }

  const stack = await loadMixerStack();
  const {
    mixer,
    Application,
    Assets,
    Spine,
    TextureAtlas,
    AtlasAttachmentLoader,
    SkeletonJson,
    GenesData,
    SamplesData,
    VariantsData,
    AnimationsData,
  } = stack;

  const {
    initAxieMixer,
    getAxieSpineFromGenes,
    getAxieColorPartShift,
    getVariantAttachmentPath,
  } = mixer;

  initAxieMixer(GenesData, SamplesData, VariantsData, AnimationsData);

  const wrap = gameCanvas.parentElement || document.getElementById('stage-wrap');
  let pixiCanvas = document.getElementById('spine-overlay');
  if (!pixiCanvas) {
    pixiCanvas = document.createElement('canvas');
    pixiCanvas.id = 'spine-overlay';
    pixiCanvas.setAttribute('aria-hidden', 'true');
    wrap.appendChild(pixiCanvas);
  }
  pixiCanvas.style.display = 'block';

  const W = game.W || gameCanvas.width;
  const H = game.H || gameCanvas.height;

  const app = new Application({
    view: pixiCanvas,
    width: W,
    height: H,
    backgroundAlpha: 0,
    antialias: true,
    resolution: window.devicePixelRatio || 1,
    autoDensity: true,
  });

  const Container = await loadContainer(stack);
  const world = new Container();
  app.stage.addChild(world);

  /** @type {Map<string, any>} */
  const spines = new Map();

  function getRequiredTextures(skeletonData, variant) {
    const skinAttachments = skeletonData.skins[0].attachments;
    const imagesToLoad = [];
    const partColorShift = getAxieColorPartShift(variant);
    for (const slotName in skinAttachments) {
      const skinSlotAttachments = skinAttachments[slotName];
      for (const attachmentName in skinSlotAttachments) {
        const p = skinSlotAttachments[attachmentName].path;
        const imagePath = AXIE_IMAGES_URL + getVariantAttachmentPath(slotName, p, variant, partColorShift);
        imagesToLoad.push({ key: p, imagePath });
      }
    }
    return imagesToLoad;
  }

  async function createAxieSpine(skeletonData, variant) {
    const resources = getRequiredTextures(skeletonData, variant);
    const texturePromises = resources.map(async (resource) => {
      try {
        const texture = await Assets.load(resource.imagePath);
        return { key: resource.key, texture };
      } catch (err) {
        console.warn('[SpineHeroes] texture miss', resource.key, err);
        return null;
      }
    });
    const loaded = (await Promise.all(texturePromises)).filter(Boolean);
    const allTextures = {};
    loaded.forEach((rec) => {
      if (rec && rec.key && rec.texture) allTextures[rec.key] = rec.texture;
    });

    const spineAtlas = new TextureAtlas();
    spineAtlas.addTextureHash(allTextures, false);
    const loader = new AtlasAttachmentLoader(spineAtlas);
    const parser = new SkeletonJson(loader);
    const spineData = parser.readSkeletonData(skeletonData);
    return new Spine(spineData);
  }

  async function buildHero(defId) {
    const genes = STARTER_GENES[defId] || SAMPLE_GENES;
    const meta = new Map();
    const built = getAxieSpineFromGenes(genes, meta, false);
    const skeletonDataAsset = built.skeletonDataAsset;
    const variant = built.variant;
    if (!skeletonDataAsset) throw new Error('No skeleton for ' + defId);
    const spine = await createAxieSpine(skeletonDataAsset, variant);
    spine.scale.set(SPINE_SCALE);
    try {
      spine.state.setAnimation(0, ANIM.idle, true);
    } catch (e) {
      console.warn('[SpineHeroes] idle missing', e);
    }
    return spine;
  }

  async function ensureSpineForAxie(axie) {
    if (!axie || !axie.defId || !STARTER_GENES[axie.defId]) return null;
    if (spines.has(axie.id)) return spines.get(axie.id);
    const spine = await buildHero(axie.defId);
    spines.set(axie.id, spine);
    world.addChild(spine);
    return spine;
  }

  const axies = (game.state && game.state.axies) || [];
  await Promise.all(
    axies
      .filter((a) => STARTER_GENES[a.defId])
      .map((a) =>
        ensureSpineForAxie(a).catch((e) => {
          console.warn('[SpineHeroes] build failed', a.id, e);
          return null;
        }),
      ),
  );

  function playAttack(axieId, kind) {
    const spine = spines.get(axieId);
    if (!spine || !spine.state) return false;
    const anim = kind === 'ranged' ? ANIM.ranged : ANIM.melee;
    try {
      spine.state.setAnimation(0, anim, false);
      spine.state.addAnimation(0, ANIM.idle, true, 0);
      return true;
    } catch (e) {
      console.warn('[SpineHeroes] playAttack failed', anim, e);
      return false;
    }
  }

  function playAttackForAxie(axie, key) {
    if (!axie) return false;
    return playAttack(axie.id, skillKind(axie, key));
  }

  function syncFromGame() {
    const st = game.state;
    if (!st) return;
    const cam = st.cam;
    const z = cam.zoom || 1;
    world.position.set(W / 2, H / 2);
    world.scale.set(z, z);
    world.pivot.set(cam.x, cam.y);

    for (const a of st.axies || []) {
      const spine = spines.get(a.id);
      if (!spine) continue;
      if (!a.alive) {
        spine.visible = false;
        continue;
      }
      spine.visible = true;
      spine.position.set(a.x, a.y);
      const s = Math.abs(spine.scale.y) || SPINE_SCALE;
      spine.scale.x = a.facingRight ? s : -s;
      spine.scale.y = s;
    }

    // Pin overlay exactly over the game canvas (stage-wrap is position:relative)
    const wrapEl = gameCanvas.parentElement;
    const g = gameCanvas.getBoundingClientRect();
    const w = wrapEl ? wrapEl.getBoundingClientRect() : g;
    if (pixiCanvas.style) {
      pixiCanvas.style.left = (g.left - w.left) + 'px';
      pixiCanvas.style.top = (g.top - w.top) + 'px';
      pixiCanvas.style.width = g.width + 'px';
      pixiCanvas.style.height = g.height + 'px';
      pixiCanvas.style.transform = 'none';
    }
  }

  const api = {
    ready: true,
    source: stack.source,
    hideCanvasHeroes: true,
    animations: Object.assign({}, ANIM),
    geneSource: 'sample/demo (Mixer docs hex) — not real Buba/Olek/Puffy',
    playAttack,
    playAttackForAxie,
    skillKind,
    syncFromGame,
    spines,
    destroy() {
      try {
        app.destroy(true, { children: true });
      } catch (_) { /* */ }
      spines.clear();
      window.SpineHeroes = null;
    },
  };

  window.SpineHeroes = api;
  try {
    document.body.dataset.spineHeroesReady = '1';
    document.body.dataset.spineHeroesSource = String(stack.source || '');
    document.body.dataset.spineHeroesCount = String(spines.size);
  } catch (_) { /* */ }
  app.ticker.add(() => {
    if (api.ready) syncFromGame();
  });

  console.info(
    '[SpineHeroes] ready via ' +
      stack.source +
      '. Genes: SAMPLE stand-ins. Anims: ' +
      ANIM.melee +
      ', ' +
      ANIM.ranged +
      ', ' +
      ANIM.idle,
  );
  return api;
}

async function loadContainer(stack) {
  try {
    if (stack.source === 'bundled') {
      const PIXI = await import('pixi.js');
      return PIXI.Container;
    }
    const PIXI = await import('https://esm.sh/pixi.js@7.2.4');
    return PIXI.Container;
  } catch (_) {
    return class FakeContainer {
      constructor() {
        this.children = [];
        this.position = { set(x, y) { this.x = x; this.y = y; }, x: 0, y: 0 };
        this.scale = { set(x, y) { this.x = x; this.y = y; }, x: 1, y: 1 };
        this.pivot = { set(x, y) { this.x = x; this.y = y; }, x: 0, y: 0 };
      }
      addChild(c) { this.children.push(c); }
    };
  }
}

export { ANIM, SAMPLE_GENES, STARTER_GENES, parseFlag as isSpineEnabled };
