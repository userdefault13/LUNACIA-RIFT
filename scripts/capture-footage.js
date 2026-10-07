// Injected into the game page. 1920×1080 composite of #game + VFX overlay, captions,
// MediaRecorder → PUT /__upload/<name> on the local capture server.
(() => {
  const g = window.__lunaciaGame;
  const game = document.getElementById('game');
  const vfx = document.getElementById('origins-vfx-overlay');
  const OUT_W = 1920, OUT_H = 1080;
  const comp = document.createElement('canvas');
  comp.width = OUT_W; comp.height = OUT_H;
  const c = comp.getContext('2d');
  const cap = { caption: '', sub: '', banner: '', wordmark: true, running: true, log: [] };
  // fit 1500×800 aspect to width → 1920×1024, 28px bars
  const GH = Math.round(OUT_W * 800 / 1500), GY = Math.round((OUT_H - GH) / 2);

  function pill(text, sub, x, y) {
    c.font = '800 34px "Trebuchet MS", system-ui, sans-serif';
    const w1 = c.measureText(text).width;
    c.font = '600 22px "Trebuchet MS", system-ui, sans-serif';
    const w2 = sub ? c.measureText(sub).width : 0;
    const w = Math.max(w1, w2) + 44, h = sub ? 92 : 60;
    c.fillStyle = 'rgba(8,10,14,0.82)';
    c.beginPath(); c.roundRect(x, y - h, w, h, 12); c.fill();
    c.strokeStyle = '#e8c46a'; c.lineWidth = 3; c.stroke();
    c.fillStyle = '#ffe08a'; c.font = '800 34px "Trebuchet MS", system-ui, sans-serif';
    c.textAlign = 'left'; c.textBaseline = 'alphabetic';
    c.fillText(text, x + 22, y - h + 44);
    if (sub) { c.fillStyle = '#f2e6c9'; c.font = '600 22px "Trebuchet MS", system-ui, sans-serif'; c.fillText(sub, x + 22, y - h + 76); }
  }

  function draw() {
    c.globalCompositeOperation = 'source-over';
    c.fillStyle = '#0a0e14'; c.fillRect(0, 0, OUT_W, OUT_H);
    c.imageSmoothingEnabled = true; c.imageSmoothingQuality = 'high';
    c.drawImage(game, 0, GY, OUT_W, GH);
    if (vfx && vfx.width) { c.globalCompositeOperation = 'lighter'; c.drawImage(vfx, 0, GY, OUT_W, GH); c.globalCompositeOperation = 'source-over'; }
    if (cap.wordmark) {
      c.font = '800 30px "Trebuchet MS", system-ui, sans-serif'; c.textAlign = 'right'; c.textBaseline = 'top';
      c.lineWidth = 6; c.strokeStyle = 'rgba(0,0,0,0.75)'; c.strokeText('LUNACIA RIFT', OUT_W - 28, GY + 18);
      c.fillStyle = '#ffe08a'; c.fillText('LUNACIA RIFT', OUT_W - 28, GY + 18);
      const t = g.state.t || 0;
      const ts = `${Math.floor(t / 60)}:${String(Math.floor(t % 60)).padStart(2, '0')}` + (g.state.timeScale > 1 ? `  ×${g.state.timeScale}` : '');
      c.font = '700 24px "Trebuchet MS", system-ui, sans-serif'; c.lineWidth = 5;
      c.strokeText(ts, OUT_W - 28, GY + 56); c.fillStyle = '#f2e6c9'; c.fillText(ts, OUT_W - 28, GY + 56);
    }
    if (cap.caption) pill(cap.caption, cap.sub, 32, GY + GH - 28);
    if (cap.banner) {
      c.fillStyle = 'rgba(8,10,14,0.7)'; c.fillRect(0, OUT_H / 2 - 90, OUT_W, 180);
      c.font = '900 96px "Trebuchet MS", system-ui, sans-serif'; c.textAlign = 'center'; c.textBaseline = 'middle';
      c.lineWidth = 10; c.strokeStyle = '#000'; c.strokeText(cap.banner, OUT_W / 2, OUT_H / 2);
      c.fillStyle = '#ffe08a'; c.fillText(cap.banner, OUT_W / 2, OUT_H / 2);
    }
  }
  function loop() { if (!cap.running) return; draw(); requestAnimationFrame(loop); }
  requestAnimationFrame(loop);

  async function put(name, blob) {
    const r = await fetch('/__upload/' + name, { method: 'PUT', body: blob });
    if (!r.ok) throw new Error('upload ' + name + ' ' + r.status);
    cap.log.push(`saved ${name} ${(blob.size / 1e6).toFixed(2)}MB`);
  }
  cap.shot = (name) => new Promise((res, rej) => { draw(); comp.toBlob((b) => put(name, b).then(res, rej), 'image/png'); });
  cap.startRec = () => {
    const stream = comp.captureStream(60);
    const mime = ['video/webm;codecs=vp9', 'video/webm;codecs=vp8', 'video/webm'].find((m) => MediaRecorder.isTypeSupported(m));
    const rec = new MediaRecorder(stream, { mimeType: mime, videoBitsPerSecond: 14e6 });
    const chunks = [];
    rec.ondataavailable = (e) => e.data.size && chunks.push(e.data);
    cap.stopRec = (name) => new Promise((res, rej) => {
      rec.onstop = () => put(name, new Blob(chunks, { type: 'video/webm' })).then(res, rej);
      rec.stop();
    });
    rec.start(1000);
    cap.log.push('rec started ' + mime);
  };
  cap.wait = (s) => new Promise((r) => setTimeout(r, s * 1000));
  cap.sel = (name) => {
    const i = g.state.axies.filter((a) => a.team === 'player').findIndex((a) => a.name === name);
    if (i >= 0) g.selectAxie(i);
  };
  // ---- Offline render: virtual clock + WebCodecs H.264 (independent of tab visibility) ----
  const FPS = 30;
  const yieldTask = () => new Promise((r) => { const ch = new MessageChannel(); ch.port1.onmessage = () => r(); ch.port2.postMessage(0); });
  cap.beginOffline = async () => {
    cap.running = false; // stop the rAF preview loop; frames are drawn explicitly
    let vnow = performance.now();
    performance.now = () => vnow; // VFX + any timers read virtual time
    const config = { codec: 'avc1.640028', width: OUT_W, height: OUT_H, bitrate: 12e6, framerate: FPS, avc: { format: 'annexb' } };
    const ok = await VideoEncoder.isConfigSupported(config);
    if (!ok.supported) throw new Error('H.264 encoder unsupported');
    const parts = [];
    const enc = new VideoEncoder({
      output: (chunk) => { const b = new Uint8Array(chunk.byteLength); chunk.copyTo(b); parts.push(b); },
      error: (e) => cap.log.push('ENC ' + e.message),
    });
    enc.configure(config);
    let frame = 0;
    cap.frame = async () => {
      vnow += 1000 / FPS;
      g.advance(1 / FPS);
      if (window.__originsVfxRender) window.__originsVfxRender();
      draw();
      const vf = new VideoFrame(comp, { timestamp: Math.round((frame * 1e6) / FPS), duration: Math.round(1e6 / FPS) });
      enc.encode(vf, { keyFrame: frame % (FPS * 2) === 0 });
      vf.close();
      frame++;
      while (enc.encodeQueueSize > 3) await yieldTask();
      if (frame % 2 === 0) await yieldTask();
    };
    cap.frames = async (sec) => { const n = Math.round(sec * FPS); for (let i = 0; i < n; i++) await cap.frame(); };
    cap.framesUntil = async (fn, maxSec) => { const n = Math.round(maxSec * FPS); for (let i = 0; i < n && !fn(); i++) await cap.frame(); };
    cap.endOffline = async (name) => {
      await enc.flush();
      enc.close();
      await put(name, new Blob(parts, { type: 'video/h264' }));
      cap.log.push(`frames=${frame} (${(frame / FPS).toFixed(1)}s)`);
    };
    cap.log.push('offline encoder ready');
  };

  window.__cap = cap;
  return 'capture ready';
})();
