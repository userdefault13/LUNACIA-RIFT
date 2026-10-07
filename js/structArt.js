/**
 * Lunacia Rift — vector structure art (Spire / Den / Nest / Sanctuary).
 * Pure Canvas2D, drawn in world space so it stays crisp at ZOOM_IN (2.7×).
 * Anchor: (x, y) is the structure's ground center (same as sim position).
 * Exposes global.LunaciaStructArt; game.js falls back to flat shapes if absent.
 */
(function (global) {
  'use strict';

  const TEAM = {
    player: {
      glow: '#7dffb0',
      core: '#5ad48a',
      deep: '#1f5a3c',
      cloth: '#2f8f5a',
      clothDark: '#1d5a38',
      roof: '#3d9e4a',
      roofDark: '#25652e',
    },
    enemy: {
      glow: '#ffb080',
      core: '#e08050',
      deep: '#6a2c16',
      cloth: '#c45a1a',
      clothDark: '#7e3610',
      roof: '#c97848',
      roofDark: '#7a3a22',
    },
  };
  const STONE = '#8a8f98';
  const STONE_LIGHT = '#b9bec6';
  const STONE_DARK = '#4b5058';
  const OUTLINE = '#141a22';
  const WOOD = '#6b4a2e';
  const WOOD_DARK = '#3d2818';
  const GOLD = '#ffd27a';

  function pal(team) {
    return TEAM[team] || TEAM.player;
  }

  function shadow(ctx, x, y, rx, ry) {
    ctx.save();
    ctx.fillStyle = 'rgba(0,0,0,0.32)';
    ctx.beginPath();
    ctx.ellipse(x, y, rx, ry, 0, 0, Math.PI * 2);
    ctx.fill();
    ctx.restore();
  }

  function glowDot(ctx, x, y, r, color, alpha) {
    const g = ctx.createRadialGradient(x, y, 0, x, y, r);
    g.addColorStop(0, color);
    g.addColorStop(1, 'rgba(0,0,0,0)');
    ctx.save();
    ctx.globalAlpha = alpha;
    ctx.fillStyle = g;
    ctx.beginPath();
    ctx.arc(x, y, r, 0, Math.PI * 2);
    ctx.fill();
    ctx.restore();
  }

  /** Gold diamonds for upgrade level, centered under the structure. */
  function levelPips(ctx, x, y, level) {
    if (!level) return;
    const gap = 7;
    const x0 = x - ((level - 1) * gap) / 2;
    for (let i = 0; i < level; i++) {
      const px = x0 + i * gap;
      ctx.beginPath();
      ctx.moveTo(px, y - 3.5);
      ctx.lineTo(px + 3, y);
      ctx.lineTo(px, y + 3.5);
      ctx.lineTo(px - 3, y);
      ctx.closePath();
      ctx.fillStyle = GOLD;
      ctx.fill();
      ctx.strokeStyle = OUTLINE;
      ctx.lineWidth = 1;
      ctx.stroke();
    }
  }

  function crystal(ctx, cx, cy, w, h, p, t, phase) {
    const bob = Math.sin(t * 2.2 + phase) * 1.6;
    const y = cy + bob;
    glowDot(ctx, cx, y, w * 2.4, p.glow, 0.35 + 0.15 * Math.sin(t * 3 + phase));
    ctx.beginPath();
    ctx.moveTo(cx, y - h / 2);
    ctx.lineTo(cx + w / 2, y);
    ctx.lineTo(cx, y + h / 2);
    ctx.lineTo(cx - w / 2, y);
    ctx.closePath();
    ctx.fillStyle = p.core;
    ctx.fill();
    // facet highlight
    ctx.beginPath();
    ctx.moveTo(cx, y - h / 2);
    ctx.lineTo(cx - w / 2, y);
    ctx.lineTo(cx, y);
    ctx.closePath();
    ctx.fillStyle = p.glow;
    ctx.fill();
    ctx.beginPath();
    ctx.moveTo(cx, y - h / 2);
    ctx.lineTo(cx + w / 2, y);
    ctx.lineTo(cx, y + h / 2);
    ctx.lineTo(cx - w / 2, y);
    ctx.closePath();
    ctx.strokeStyle = OUTLINE;
    ctx.lineWidth = 1.2;
    ctx.stroke();
  }

  // ---------------------------------------------------------------- Spire
  /** Stone obelisk with team banner + floating crystal. T2 is taller with a collar. */
  function drawSpire(ctx, s, t) {
    const p = pal(s.team);
    const x = s.x;
    const y = s.y + s.r * 0.55; // ground line
    const tall = s.tier === 2;
    const baseW = s.r * 1.5;
    const topW = s.r * 0.78;
    const h = s.r * (tall ? 2.35 : 1.95);
    const phase = (s.x + s.y) * 0.013;

    shadow(ctx, x, y + 1, baseW * 0.72, baseW * 0.22);

    if (!s.alive) {
      // rubble: broken stump + scattered blocks
      ctx.fillStyle = STONE_DARK;
      ctx.strokeStyle = OUTLINE;
      ctx.lineWidth = 1.5;
      ctx.beginPath();
      ctx.moveTo(x - baseW / 2, y);
      ctx.lineTo(x - baseW / 2 + 3, y - h * 0.32);
      ctx.lineTo(x - 2, y - h * 0.22);
      ctx.lineTo(x + 4, y - h * 0.38);
      ctx.lineTo(x + baseW / 2 - 3, y - h * 0.18);
      ctx.lineTo(x + baseW / 2, y);
      ctx.closePath();
      ctx.fill();
      ctx.stroke();
      [[-baseW * 0.75, -2, 5], [baseW * 0.7, -1, 4], [baseW * 0.35, 3, 3.5]].forEach(([dx, dy, r]) => {
        ctx.fillStyle = STONE;
        ctx.fillRect(x + dx - r, y + dy - r, r * 2, r * 1.6);
        ctx.strokeRect(x + dx - r, y + dy - r, r * 2, r * 1.6);
      });
      return;
    }

    // plinth (two steps)
    ctx.lineWidth = 1.5;
    ctx.strokeStyle = OUTLINE;
    ctx.fillStyle = STONE_DARK;
    ctx.fillRect(x - baseW / 2 - 3, y - 6, baseW + 6, 6);
    ctx.strokeRect(x - baseW / 2 - 3, y - 6, baseW + 6, 6);
    ctx.fillStyle = STONE;
    ctx.fillRect(x - baseW / 2, y - 11, baseW, 5);
    ctx.strokeRect(x - baseW / 2, y - 11, baseW, 5);

    // tapered shaft
    const sy = y - 11;
    const ty = sy - h;
    const grad = ctx.createLinearGradient(x - baseW / 2, 0, x + baseW / 2, 0);
    grad.addColorStop(0, STONE_LIGHT);
    grad.addColorStop(0.55, STONE);
    grad.addColorStop(1, STONE_DARK);
    ctx.beginPath();
    ctx.moveTo(x - baseW * 0.42, sy);
    ctx.lineTo(x - topW / 2, ty);
    ctx.lineTo(x + topW / 2, ty);
    ctx.lineTo(x + baseW * 0.42, sy);
    ctx.closePath();
    ctx.fillStyle = grad;
    ctx.fill();
    ctx.stroke();

    // masonry seams
    ctx.strokeStyle = 'rgba(20,26,34,0.35)';
    ctx.lineWidth = 1;
    for (let k = 1; k < (tall ? 4 : 3); k++) {
      const yy = sy - (h * k) / (tall ? 4 : 3);
      const f = (sy - yy) / h;
      const half = baseW * 0.42 + (topW / 2 - baseW * 0.42) * f;
      ctx.beginPath();
      ctx.moveTo(x - half, yy);
      ctx.lineTo(x + half, yy);
      ctx.stroke();
    }

    // team banner hanging on the front face
    const bw = topW * 0.85;
    const by0 = ty + h * 0.12;
    const bh = h * 0.5;
    const sway = Math.sin(t * 1.6 + phase) * 1.2;
    ctx.beginPath();
    ctx.moveTo(x - bw / 2, by0);
    ctx.lineTo(x + bw / 2, by0);
    ctx.lineTo(x + bw / 2 + sway, by0 + bh);
    ctx.lineTo(x + sway, by0 + bh - 5);
    ctx.lineTo(x - bw / 2 + sway, by0 + bh);
    ctx.closePath();
    ctx.fillStyle = p.cloth;
    ctx.fill();
    ctx.strokeStyle = OUTLINE;
    ctx.lineWidth = 1.2;
    ctx.stroke();
    ctx.fillStyle = p.clothDark;
    ctx.fillRect(x - bw / 2, by0, bw, 3);
    // banner emblem: small leaf rune
    ctx.beginPath();
    ctx.ellipse(x + sway * 0.5, by0 + bh * 0.48, bw * 0.17, bw * 0.28, 0, 0, Math.PI * 2);
    ctx.fillStyle = p.glow;
    ctx.globalAlpha = 0.85;
    ctx.fill();
    ctx.globalAlpha = 1;

    // capstone + T2 collar
    ctx.strokeStyle = OUTLINE;
    ctx.lineWidth = 1.5;
    ctx.fillStyle = STONE_LIGHT;
    ctx.fillRect(x - topW / 2 - 3, ty - 4, topW + 6, 5);
    ctx.strokeRect(x - topW / 2 - 3, ty - 4, topW + 6, 5);
    if (tall) {
      ctx.fillStyle = GOLD;
      ctx.fillRect(x - topW / 2 - 1, ty + 4, topW + 2, 3);
      ctx.strokeRect(x - topW / 2 - 1, ty + 4, topW + 2, 3);
    }

    crystal(ctx, x, ty - 14, topW * 0.7, topW * 1.25, p, t, phase);
    levelPips(ctx, x, y + 6, s.level || 0);
  }

  // ---------------------------------------------------------------- Den
  /** Earthen burrow with leaf-thatch roof, arched door, and Pack class emblem. */
  function drawDen(ctx, s, t, emblem) {
    const p = pal(s.team);
    const x = s.x;
    const y = s.y + s.r * 0.6;
    const w = s.r * 2.5;
    const h = s.r * 1.5;
    const phase = (s.x + s.y) * 0.011;

    shadow(ctx, x, y + 1, w * 0.58, w * 0.14);

    if (!s.alive) {
      ctx.fillStyle = '#4a3a2a';
      ctx.strokeStyle = OUTLINE;
      ctx.lineWidth = 1.5;
      ctx.beginPath();
      ctx.moveTo(x - w / 2, y);
      ctx.quadraticCurveTo(x - w * 0.2, y - h * 0.55, x, y - h * 0.3);
      ctx.quadraticCurveTo(x + w * 0.25, y - h * 0.5, x + w / 2, y);
      ctx.closePath();
      ctx.fill();
      ctx.stroke();
      ctx.strokeStyle = WOOD_DARK;
      ctx.lineWidth = 2;
      ctx.beginPath();
      ctx.moveTo(x - w * 0.3, y - 2);
      ctx.lineTo(x - w * 0.05, y - h * 0.45);
      ctx.moveTo(x + w * 0.28, y - 1);
      ctx.lineTo(x + w * 0.1, y - h * 0.4);
      ctx.stroke();
      return;
    }

    // mound body
    const mg = ctx.createLinearGradient(0, y - h, 0, y);
    mg.addColorStop(0, '#8a6a48');
    mg.addColorStop(1, '#5a4030');
    ctx.beginPath();
    ctx.moveTo(x - w / 2, y);
    ctx.bezierCurveTo(x - w / 2, y - h * 0.9, x + w / 2, y - h * 0.9, x + w / 2, y);
    ctx.closePath();
    ctx.fillStyle = mg;
    ctx.fill();
    ctx.strokeStyle = OUTLINE;
    ctx.lineWidth = 1.5;
    ctx.stroke();

    // leaf thatch roof (team color), layered scallops
    const roofY = y - h * 0.62;
    for (let row = 0; row < 2; row++) {
      const ry = roofY - row * 7;
      const rw = w * (0.92 - row * 0.22);
      const n = 5 - row;
      for (let i = 0; i < n; i++) {
        const lx = x - rw / 2 + (rw / n) * (i + 0.5);
        ctx.beginPath();
        ctx.ellipse(lx, ry, rw / n / 1.6, 6.5, 0, 0, Math.PI * 2);
        ctx.fillStyle = (i + row) % 2 ? p.roof : p.roofDark;
        ctx.fill();
        ctx.strokeStyle = OUTLINE;
        ctx.lineWidth = 1;
        ctx.stroke();
      }
    }

    // arched door with inner glow
    const dw = w * 0.3;
    const dh = h * 0.55;
    ctx.beginPath();
    ctx.moveTo(x - dw / 2, y);
    ctx.lineTo(x - dw / 2, y - dh + dw / 2);
    ctx.arc(x, y - dh + dw / 2, dw / 2, Math.PI, 0);
    ctx.lineTo(x + dw / 2, y);
    ctx.closePath();
    ctx.fillStyle = '#120c08';
    ctx.fill();
    ctx.strokeStyle = WOOD;
    ctx.lineWidth = 2;
    ctx.stroke();
    glowDot(ctx, x, y - dh * 0.35, dw * 0.9, p.glow, 0.28 + 0.12 * Math.sin(t * 2.6 + phase));

    // side posts
    ctx.fillStyle = WOOD;
    ctx.strokeStyle = OUTLINE;
    ctx.lineWidth = 1;
    [-1, 1].forEach((sd) => {
      const px = x + sd * (w / 2 - 4);
      ctx.fillRect(px - 2, y - h * 0.5, 4, h * 0.5);
      ctx.strokeRect(px - 2, y - h * 0.5, 4, h * 0.5);
    });

    // Pack class emblem medallion on the roof peak
    const ey = roofY - 18;
    ctx.beginPath();
    ctx.arc(x, ey, 9, 0, Math.PI * 2);
    ctx.fillStyle = 'rgba(10,14,20,0.85)';
    ctx.fill();
    ctx.strokeStyle = GOLD;
    ctx.lineWidth = 1.5;
    ctx.stroke();
    if (emblem && emblem.img) {
      const iw = 15;
      const ih = iw * (emblem.img.naturalHeight / emblem.img.naturalWidth);
      ctx.drawImage(emblem.img, x - iw / 2, ey - ih / 2, iw, ih);
    } else {
      // paw rune
      ctx.fillStyle = p.glow;
      ctx.beginPath();
      ctx.arc(x, ey + 2, 3, 0, Math.PI * 2);
      [-3.5, 0, 3.5].forEach((dx) => {
        ctx.moveTo(x + dx + 1.4, ey - 3);
        ctx.arc(x + dx, ey - 3, 1.4, 0, Math.PI * 2);
      });
      ctx.fill();
    }

    levelPips(ctx, x, y + 6, s.level || 0);
  }

  // ---------------------------------------------------------------- Nest
  /** Woven twig nest cradling a glowing egg. Locked → shimmering barrier dome. */
  function drawNest(ctx, s, t) {
    const p = pal(s.team);
    const x = s.x;
    const y = s.y;
    const r = s.r;

    shadow(ctx, x, y + r * 0.55, r * 1.15, r * 0.35);

    if (!s.alive) {
      // shattered egg in an empty nest
      ctx.fillStyle = WOOD_DARK;
      ctx.beginPath();
      ctx.ellipse(x, y + r * 0.3, r, r * 0.38, 0, 0, Math.PI * 2);
      ctx.fill();
      ctx.fillStyle = '#d8d2c4';
      ctx.strokeStyle = OUTLINE;
      ctx.lineWidth = 1.2;
      [[-r * 0.35, 0, -0.6], [r * 0.3, r * 0.05, 0.5], [0, r * 0.15, 0.1]].forEach(([dx, dy, rot]) => {
        ctx.save();
        ctx.translate(x + dx, y + dy);
        ctx.rotate(rot);
        ctx.beginPath();
        ctx.moveTo(-7, 4);
        ctx.lineTo(-4, -6);
        ctx.lineTo(0, -1);
        ctx.lineTo(4, -7);
        ctx.lineTo(7, 4);
        ctx.closePath();
        ctx.fill();
        ctx.stroke();
        ctx.restore();
      });
      return;
    }

    // outer aura
    glowDot(ctx, x, y - r * 0.2, r * 1.9, s.unlocked ? GOLD : p.glow, s.unlocked ? 0.35 + 0.15 * Math.sin(t * 4) : 0.22);

    // back rim of nest
    ctx.fillStyle = WOOD_DARK;
    ctx.beginPath();
    ctx.ellipse(x, y + r * 0.15, r * 1.05, r * 0.45, 0, Math.PI, Math.PI * 2);
    ctx.fill();

    // egg
    const ey = y - r * 0.2 + Math.sin(t * 1.8) * 1.2;
    const eg = ctx.createRadialGradient(x - r * 0.2, ey - r * 0.35, r * 0.1, x, ey, r * 0.85);
    eg.addColorStop(0, '#ffffff');
    eg.addColorStop(0.45, p.glow);
    eg.addColorStop(1, p.core);
    ctx.beginPath();
    ctx.ellipse(x, ey, r * 0.55, r * 0.72, 0, 0, Math.PI * 2);
    ctx.fillStyle = eg;
    ctx.fill();
    ctx.strokeStyle = OUTLINE;
    ctx.lineWidth = 1.8;
    ctx.stroke();
    // egg spots
    ctx.fillStyle = p.deep;
    ctx.globalAlpha = 0.55;
    [[0.18, -0.3, 0.09], [-0.22, 0.05, 0.07], [0.12, 0.25, 0.06]].forEach(([dx, dy, rr]) => {
      ctx.beginPath();
      ctx.arc(x + dx * r, ey + dy * r, rr * r, 0, Math.PI * 2);
      ctx.fill();
    });
    ctx.globalAlpha = 1;
    // cracks as Nest takes damage
    const dmg = 1 - Math.max(0, s.hp / s.maxHp);
    if (dmg > 0.2) {
      ctx.strokeStyle = OUTLINE;
      ctx.lineWidth = 1.4;
      ctx.beginPath();
      ctx.moveTo(x - r * 0.1, ey - r * 0.65);
      ctx.lineTo(x + r * 0.05, ey - r * 0.4);
      ctx.lineTo(x - r * 0.08, ey - r * 0.2);
      if (dmg > 0.5) {
        ctx.lineTo(x + r * 0.12, ey + r * 0.05);
        ctx.moveTo(x + r * 0.05, ey - r * 0.4);
        ctx.lineTo(x + r * 0.28, ey - r * 0.32);
      }
      if (dmg > 0.75) {
        ctx.moveTo(x - r * 0.08, ey - r * 0.2);
        ctx.lineTo(x - r * 0.32, ey - r * 0.05);
      }
      ctx.stroke();
    }

    // front rim: woven twigs
    ctx.fillStyle = WOOD;
    ctx.beginPath();
    ctx.ellipse(x, y + r * 0.2, r * 1.08, r * 0.42, 0, 0, Math.PI);
    ctx.lineTo(x - r * 1.08, y + r * 0.2);
    ctx.fill();
    ctx.strokeStyle = OUTLINE;
    ctx.lineWidth = 1.5;
    ctx.stroke();
    ctx.strokeStyle = WOOD_DARK;
    ctx.lineWidth = 1.6;
    for (let i = -4; i <= 4; i++) {
      const tx = x + (i / 4.5) * r;
      ctx.beginPath();
      ctx.moveTo(tx - 6, y + r * 0.22);
      ctx.quadraticCurveTo(tx, y + r * 0.42, tx + 7, y + r * 0.3);
      ctx.stroke();
    }
    ctx.strokeStyle = '#8a6a48';
    ctx.lineWidth = 1;
    ctx.beginPath();
    ctx.ellipse(x, y + r * 0.2, r * 1.0, r * 0.3, 0, 0.15, Math.PI - 0.15);
    ctx.stroke();

    // locked barrier dome
    if (!s.unlocked) {
      const shimmer = 0.5 + 0.5 * Math.sin(t * 2.4);
      ctx.save();
      ctx.beginPath();
      ctx.ellipse(x, y + r * 0.2, r * 1.3, r * 1.45, 0, Math.PI, Math.PI * 2);
      ctx.closePath();
      const dg = ctx.createLinearGradient(0, y - r * 1.3, 0, y + r * 0.2);
      dg.addColorStop(0, 'rgba(160,190,230,0.30)');
      dg.addColorStop(1, 'rgba(160,190,230,0.08)');
      ctx.fillStyle = dg;
      ctx.fill();
      ctx.strokeStyle = `rgba(190,215,255,${0.5 + 0.3 * shimmer})`;
      ctx.lineWidth = 2;
      ctx.stroke();
      // hex runes on the dome
      ctx.strokeStyle = `rgba(190,215,255,${0.25 + 0.2 * shimmer})`;
      ctx.lineWidth = 1;
      for (let i = 0; i < 5; i++) {
        const a = Math.PI + (Math.PI * (i + 0.5)) / 5;
        const hx = x + Math.cos(a) * r * 0.95;
        const hy = y + r * 0.2 + Math.sin(a) * r * 1.05;
        ctx.beginPath();
        for (let k = 0; k < 6; k++) {
          const aa = (Math.PI / 3) * k;
          const px = hx + Math.cos(aa) * 4;
          const py = hy + Math.sin(aa) * 4;
          if (k === 0) ctx.moveTo(px, py);
          else ctx.lineTo(px, py);
        }
        ctx.closePath();
        ctx.stroke();
      }
      // padlock glyph
      const ly = y - r * 1.05;
      ctx.fillStyle = 'rgba(10,14,20,0.85)';
      ctx.strokeStyle = '#bcd2f0';
      ctx.lineWidth = 1.5;
      ctx.beginPath();
      ctx.arc(x, ly - 4, 4, Math.PI, 0);
      ctx.stroke();
      ctx.fillRect(x - 6, ly - 4, 12, 9);
      ctx.strokeRect(x - 6, ly - 4, 12, 9);
      ctx.fillStyle = '#bcd2f0';
      ctx.fillRect(x - 1, ly - 1, 2, 4);
      ctx.restore();
    }
  }

  // ---------------------------------------------------------------- Sanctuary
  /** Soft healing glade: radial glow, rotating rune ring, standing stones. */
  function drawSanctuary(ctx, pos, R, team, t) {
    const p = pal(team);
    const g = ctx.createRadialGradient(pos.x, pos.y, R * 0.15, pos.x, pos.y, R);
    g.addColorStop(0, team === 'player' ? 'rgba(125,255,176,0.30)' : 'rgba(255,176,128,0.30)');
    g.addColorStop(0.75, team === 'player' ? 'rgba(90,212,138,0.14)' : 'rgba(224,128,80,0.14)');
    g.addColorStop(1, 'rgba(0,0,0,0)');
    ctx.fillStyle = g;
    ctx.beginPath();
    ctx.arc(pos.x, pos.y, R, 0, Math.PI * 2);
    ctx.fill();

    // rotating dashed rune ring
    ctx.save();
    ctx.translate(pos.x, pos.y);
    ctx.rotate(t * 0.25 * (team === 'player' ? 1 : -1));
    ctx.strokeStyle = p.glow;
    ctx.globalAlpha = 0.55;
    ctx.lineWidth = 2;
    ctx.setLineDash([10, 7]);
    ctx.beginPath();
    ctx.arc(0, 0, R - 4, 0, Math.PI * 2);
    ctx.stroke();
    ctx.setLineDash([]);
    ctx.globalAlpha = 0.3;
    ctx.lineWidth = 1;
    ctx.beginPath();
    ctx.arc(0, 0, R - 12, 0, Math.PI * 2);
    ctx.stroke();
    ctx.restore();

    // standing stones around the ring
    ctx.lineWidth = 1.2;
    for (let i = 0; i < 6; i++) {
      const a = (Math.PI * 2 * i) / 6 + Math.PI / 6;
      const sx = pos.x + Math.cos(a) * (R - 4);
      const sy = pos.y + Math.sin(a) * (R - 4);
      ctx.fillStyle = STONE;
      ctx.strokeStyle = OUTLINE;
      ctx.beginPath();
      ctx.moveTo(sx - 3.5, sy + 4);
      ctx.lineTo(sx - 2.5, sy - 6);
      ctx.lineTo(sx + 2.5, sy - 7);
      ctx.lineTo(sx + 3.5, sy + 4);
      ctx.closePath();
      ctx.fill();
      ctx.stroke();
      ctx.fillStyle = p.glow;
      ctx.globalAlpha = 0.5 + 0.4 * Math.sin(t * 2 + i);
      ctx.fillRect(sx - 1, sy - 3, 2, 3);
      ctx.globalAlpha = 1;
    }

    // drifting motes
    for (let i = 0; i < 5; i++) {
      const k = (t * 0.35 + i / 5) % 1;
      const a = i * 2.4;
      const mx = pos.x + Math.cos(a) * R * 0.45;
      const my = pos.y + Math.sin(a) * R * 0.35 - k * 22;
      ctx.globalAlpha = Math.sin(k * Math.PI) * 0.8;
      ctx.fillStyle = p.glow;
      ctx.beginPath();
      ctx.arc(mx, my, 1.6, 0, Math.PI * 2);
      ctx.fill();
    }
    ctx.globalAlpha = 1;
  }

  global.LunaciaStructArt = { drawSpire, drawDen, drawNest, drawSanctuary };
})(typeof window !== 'undefined' ? window : globalThis);
