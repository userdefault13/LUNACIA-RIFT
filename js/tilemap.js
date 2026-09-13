/**
 * Lunacia Rift — multi-tileset / multi-layer map loader (Aseprite-Mappie pack).
 *
 * Preferred (A): load lunacia_rift.tiled.json; resolve each tileset image by path;
 * for each visible tilelayer bottom→top (skip POI), map GID→tileset via firstgid,
 * draw into an offscreen 1504×800 canvas.
 *
 * Fallback (B): lunacia_rift_painted.png → lunacia_rift_mappie_preview.png →
 * lunacia_rift_mappie.png → lunacia_rift.png.
 *
 * game.js drawImage-crops the bake to the 1500×800 playfield.
 */
(function (global) {
  'use strict';

  const DEFAULT_JSON = 'assets/map/lunacia_rift.tiled.json';
  const PAINTED_PNG = 'assets/map/lunacia_rift_painted.png';
  const MAPPIE_PREVIEW_PNG = 'assets/map/lunacia_rift_mappie_preview.png';
  const MAPPIE_PNG = 'assets/map/lunacia_rift_mappie.png';
  const PLATE_PNG = 'assets/map/lunacia_rift.png';

  /** Skip landmark color blocks — structures already drawn in game.js */
  const SKIP_LAYERS = new Set(['poi', 'POI']);

  // Tiled stores flip/rotate in the high bits of a GID
  const GID_FLIP_MASK = 0xe0000000;

  function loadImage(src) {
    return new Promise((resolve, reject) => {
      const img = new Image();
      img.onload = () => resolve(img);
      img.onerror = () => reject(new Error('tilemap: failed to load image ' + src));
      img.src = src;
    });
  }

  async function fetchJson(url) {
    const res = await fetch(url);
    if (!res.ok) throw new Error('tilemap: failed to fetch ' + url + ' (' + res.status + ')');
    return res.json();
  }


  /** Punch near-black RGB to transparent (trees sheets often ship on black). */
  function punchBlackToAlpha(img) {
    const c = document.createElement('canvas');
    c.width = img.naturalWidth || img.width;
    c.height = img.naturalHeight || img.height;
    const ctx = c.getContext('2d');
    ctx.drawImage(img, 0, 0);
    const id = ctx.getImageData(0, 0, c.width, c.height);
    const d = id.data;
    for (let i = 0; i < d.length; i += 4) {
      if (d[i] + d[i + 1] + d[i + 2] < 40) d[i + 3] = 0;
    }
    ctx.putImageData(id, 0, 0);
    return c;
  }

  /** True if tile region has almost no opaque non-black pixels. */
  function tileIsEmpty(img, sx, sy, tw, th) {
    const c = document.createElement('canvas');
    c.width = tw;
    c.height = th;
    const ctx = c.getContext('2d');
    ctx.drawImage(img, sx, sy, tw, th, 0, 0, tw, th);
    const d = ctx.getImageData(0, 0, tw, th).data;
    let useful = 0;
    for (let i = 0; i < d.length; i += 4) {
      if (d[i + 3] > 10 && d[i] + d[i + 1] + d[i + 2] > 30) useful++;
    }
    return useful < 8;
  }

  function resolveSibling(jsonUrl, fileName) {
    const i = jsonUrl.lastIndexOf('/');
    const base = i >= 0 ? jsonUrl.slice(0, i + 1) : '';
    return base + fileName;
  }

  /**
   * Sort tilesets by firstgid ascending so GID lookup can walk from high→low.
   * @param {object[]} tilesets
   */
  function prepareTilesets(tilesets) {
    return (tilesets || [])
      .filter((ts) => ts && ts.image && (ts.firstgid | 0) > 0)
      .slice()
      .sort((a, b) => (a.firstgid | 0) - (b.firstgid | 0));
  }

  /**
   * Find tileset owning this clean GID (highest firstgid ≤ gid).
   * @param {object[]} sorted
   * @param {number} gid
   */
  function tilesetForGid(sorted, gid) {
    for (let i = sorted.length - 1; i >= 0; i--) {
      if (gid >= (sorted[i].firstgid | 0)) return sorted[i];
    }
    return null;
  }

  /**
   * Draw one tilelayer using multi-tileset GID resolution.
   * @param {object} map
   * @param {object[]} sortedTilesets — each has ._img attached
   * @param {object} layer
   * @param {CanvasRenderingContext2D} destCtx
   */
  function bakeTileLayerMulti(map, sortedTilesets, layer, destCtx) {
    const tw = map.tilewidth;
    const th = map.tileheight;
    const mapCols = map.width;
    const data = layer.data;
    if (!data || !data.length) return 0;

    let drawn = 0;
    for (let i = 0; i < data.length; i++) {
      const raw = data[i] | 0;
      if (!raw) continue;
      const gid = raw & ~GID_FLIP_MASK;
      if (!gid) continue;

      const tileset = tilesetForGid(sortedTilesets, gid);
      if (!tileset || !tileset._img) continue;

      const firstgid = tileset.firstgid | 0;
      const localId = gid - firstgid;
      if (localId < 0) continue;
      if (tileset.tilecount && localId >= (tileset.tilecount | 0)) continue;

      const columns = tileset.columns | 0;
      if (!columns) continue;
      const margin = tileset.margin | 0;
      const spacing = tileset.spacing | 0;
      const tileW = tileset.tilewidth || tw;
      const tileH = tileset.tileheight || th;

      const tileCol = localId % columns;
      const tileRow = (localId / columns) | 0;
      const sx = margin + tileCol * (tileW + spacing);
      const sy = margin + tileRow * (tileH + spacing);
      if (tileIsEmpty(tileset._img, sx, sy, tileW, tileH)) continue;
      const dx = (i % mapCols) * tw;
      const dy = ((i / mapCols) | 0) * th;
      destCtx.drawImage(tileset._img, sx, sy, tileW, tileH, dx, dy, tw, th);
      drawn++;
    }
    return drawn;
  }

  async function bakeFromPng(pngUrl) {
    const img = await loadImage(pngUrl);
    const canvas = document.createElement('canvas');
    canvas.width = img.naturalWidth || img.width;
    canvas.height = img.naturalHeight || img.height;
    const ctx = canvas.getContext('2d');
    ctx.imageSmoothingEnabled = false;
    ctx.drawImage(img, 0, 0);
    return {
      canvas,
      map: {
        width: Math.round(canvas.width / 16),
        height: Math.round(canvas.height / 16),
        tilewidth: 16,
        tileheight: 16,
        source: pngUrl,
      },
      mode: 'png',
    };
  }

  /**
   * Approach A: multi-tileset / multi-layer GID composite from Tiled JSON.
   */
  async function bakeFromTiledMulti(jsonUrl) {
    const map = await fetchJson(jsonUrl);
    if (!map.tilesets || !map.tilesets.length) {
      throw new Error('tilemap: no tilesets in ' + jsonUrl);
    }

    const sorted = prepareTilesets(map.tilesets);
    if (!sorted.length) {
      throw new Error('tilemap: tilesets missing image paths in ' + jsonUrl);
    }

    // Load every tileset image in parallel
    await Promise.all(
      sorted.map(async (ts) => {
        const url = resolveSibling(jsonUrl, ts.image);
        let img = await loadImage(url);
        const name = String(ts.name || ts.image || '').toLowerCase();
        // Trees (and lake sheets) often export on pure black — punch to alpha
        if (name.includes('tree') || name.includes('lake') || name.includes('water')) {
          img = punchBlackToAlpha(img);
        }
        ts._img = img;
        // Infer columns from image if missing
        if (!(ts.columns | 0)) {
          const iw = ts.imagewidth || ts._img.naturalWidth || ts._img.width;
          const tw = ts.tilewidth || map.tilewidth || 16;
          const spacing = ts.spacing | 0;
          const margin = ts.margin | 0;
          ts.columns = Math.max(1, ((iw - margin * 2 + spacing) / (tw + spacing)) | 0);
        }
      })
    );

    const canvas = document.createElement('canvas');
    canvas.width = map.width * map.tilewidth;
    canvas.height = map.height * map.tileheight;
    const ctx = canvas.getContext('2d');
    ctx.imageSmoothingEnabled = false;
    // Opaque grass fill so punched tree holes never show as black
    ctx.fillStyle = '#6db84a';
    ctx.fillRect(0, 0, canvas.width, canvas.height);

    let totalDrawn = 0;
    let layersUsed = 0;

    for (let li = 0; li < map.layers.length; li++) {
      const layer = map.layers[li];
      if (layer.type !== 'tilelayer') continue;
      if (layer.visible === false) continue;
      if (SKIP_LAYERS.has(layer.name)) continue;

      const n = bakeTileLayerMulti(map, sorted, layer, ctx);
      if (n > 0) {
        totalDrawn += n;
        layersUsed++;
      }
    }

    if (totalDrawn === 0 || canvas.width <= 0 || canvas.height <= 0) {
      throw new Error('tilemap: empty multi-tileset bake from ' + jsonUrl);
    }

    console.info(
      '[LunaciaTilemap] multi-tileset bake OK:',
      layersUsed,
      'layers,',
      totalDrawn,
      'tiles,',
      sorted.length,
      'tilesets →',
      canvas.width + '×' + canvas.height
    );

    return {
      canvas,
      map: Object.assign({}, map, { source: jsonUrl, bakeMode: 'multi-tileset' }),
      mode: 'multi-tileset',
    };
  }

  async function bakeFromPngChain(urls) {
    let lastErr = null;
    for (let i = 0; i < urls.length; i++) {
      try {
        const r = await bakeFromPng(urls[i]);
        console.info('[LunaciaTilemap] PNG bake OK:', urls[i], r.canvas.width + '×' + r.canvas.height);
        return r;
      } catch (err) {
        lastErr = err;
        console.warn('[LunaciaTilemap] PNG miss:', urls[i], err && err.message ? err.message : err);
      }
    }
    throw lastErr || new Error('tilemap: all PNG fallbacks failed');
  }

  async function bake() {
    // A) Multi-tileset / multi-layer GID composite (with black-punch + grass base)
    try {
      return await bakeFromTiledMulti(DEFAULT_JSON);
    } catch (err) {
      console.warn(
        '[LunaciaTilemap] multi-tileset bake failed, falling back to PNG:',
        err && err.message ? err.message : err
      );
    }
    // B) Prefer clean preview (0 black holes), then painted / mappie / plate
    return bakeFromPngChain([MAPPIE_PREVIEW_PNG, PAINTED_PNG, MAPPIE_PNG, PLATE_PNG]);
  }

  const api = {
    canvas: null,
    map: null,
    ready: false,
    error: null,
    promise: null,
    mode: null,

    /** @returns {boolean} */
    isReady() {
      return !!(this.ready && this.canvas && this.canvas.width > 0);
    },

    /**
     * Draw baked map into a 1500×800 world (crop 4px from the right of 1504-wide bake).
     * @param {CanvasRenderingContext2D} ctx
     * @param {number} destW
     * @param {number} destH
     */
    draw(ctx, destW, destH) {
      if (!this.isReady()) return false;
      const srcW = Math.min(destW, this.canvas.width);
      const srcH = Math.min(destH, this.canvas.height);
      ctx.drawImage(this.canvas, 0, 0, srcW, srcH, 0, 0, destW, destH);
      return true;
    },

    load() {
      this.promise = bake()
        .then((r) => {
          this.canvas = r.canvas;
          this.map = r.map;
          this.mode = r.mode;
          this.ready = true;
          this.error = null;
          return this;
        })
        .catch((err) => {
          this.ready = false;
          this.error = err;
          console.warn('[LunaciaTilemap]', err && err.message ? err.message : err);
          return this;
        });
      return this.promise;
    },
  };

  api.load();
  global.LunaciaTilemap = api;
})(typeof window !== 'undefined' ? window : globalThis);
