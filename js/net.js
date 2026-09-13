/**
 * Lunacia Rift — thin Colyseus client for lunacia_rift rooms.
 */
import { Client } from "colyseus.js";

export const DEFAULT_ENDPOINT = "ws://142.93.55.122:2567";
export const LS_ENDPOINT_KEY = "lunacia_mp_endpoint";

/** @param {string} raw */
export function normalizeEndpoint(raw) {
  let s = String(raw || '').trim();
  if (!s) return DEFAULT_ENDPOINT;
  if (s.startsWith('http://')) s = 'ws://' + s.slice(7);
  else if (s.startsWith('https://')) s = 'wss://' + s.slice(8);
  else if (!s.startsWith('ws://') && !s.startsWith('wss://')) s = 'ws://' + s;
  if (s.endsWith('/')) s = s.slice(0, -1);
  return s;
}

export function resolveEndpoint() {
  try {
    const q = new URLSearchParams(location.search);
    const mp = q.get('mp');
    if (mp) {
      const ep = normalizeEndpoint(mp);
      try { localStorage.setItem(LS_ENDPOINT_KEY, ep); } catch (_) {}
      return ep;
    }
  } catch (_) {}
  try {
    const saved = localStorage.getItem(LS_ENDPOINT_KEY);
    if (saved) return normalizeEndpoint(saved);
  } catch (_) {}
  return DEFAULT_ENDPOINT;
}

function httpBaseFromWs(wsUrl) {
  if (wsUrl.startsWith('wss://')) return 'https://' + wsUrl.slice(6);
  if (wsUrl.startsWith('ws://')) return 'http://' + wsUrl.slice(5);
  return wsUrl;
}

function playersFromState(state) {
  const out = [];
  if (!state || !state.players) return out;
  state.players.forEach((p, sessionId) => {
    out.push({
      sessionId: p.sessionId || sessionId,
      displayName: p.displayName || '',
      side: p.side || '',
      isReady: !!p.isReady,
      connected: p.connected !== false,
    });
  });
  return out;
}

export class LunaciaNet extends EventTarget {
  constructor() {
    super();
    this.endpoint = resolveEndpoint();
    this.client = null;
    this.room = null;
    this.multiplayer = false;
    this.sessionId = null;
    this.side = null;
    this.isHost = false;
    this.inviteCode = null;
    this.phase = 'idle';
    this.mapSeed = null;
    this.players = [];
    this._cb = {};
  }

  setCallbacks(cb = {}) {
    this._cb = cb || {};
  }

  _emit(name, detail) {
    this.dispatchEvent(new CustomEvent(name, { detail }));
    const map = {
      phase: 'onPhase',
      players: 'onPlayers',
      cmd: 'onCmd',
      snapshot: 'onSnapshot',
      matchStarted: 'onMatchStarted',
      matchEnded: 'onMatchEnded',
      error: 'onError',
      connection: 'onConnection',
    };
    const fn = this._cb[map[name]];
    if (typeof fn === 'function') {
      try { fn(detail); } catch (e) { console.warn('[LunaciaNet] callback', name, e); }
    }
  }

  _error(err) {
    const e = err instanceof Error ? err : new Error(String(err));
    console.warn('[LunaciaNet]', e.message || e);
    this._emit('error', e);
  }

  _syncFromState() {
    const st = this.room && this.room.state;
    if (!st) return;
    const prevPhase = this.phase;
    this.phase = st.phase || this.phase;
    this.inviteCode = st.inviteCode || this.inviteCode;
    this.mapSeed = st.mapSeed;
    this.players = playersFromState(st);
    const me = this.players.find((p) => p.sessionId === this.sessionId);
    if (me) {
      this.side = me.side;
      this.isHost = st.hostSessionId === this.sessionId;
    } else {
      this.isHost = st.hostSessionId === this.sessionId;
    }
    this._emit('players', {
      players: this.players,
      inviteCode: this.inviteCode,
      phase: this.phase,
      isHost: this.isHost,
      side: this.side,
      mapSeed: this.mapSeed,
    });
    if (this.phase !== prevPhase) {
      this._emit('phase', {
        phase: this.phase,
        inviteCode: this.inviteCode,
        isHost: this.isHost,
        side: this.side,
        mapSeed: this.mapSeed,
      });
    }
  }

  _wireRoom(room) {
    this.room = room;
    this.sessionId = room.sessionId;
    this.multiplayer = true;
    this._syncFromState();
    this._emit('connection', true);

    room.onStateChange(() => { this._syncFromState(); });

    room.onMessage('cmd', (envelope) => { this._emit('cmd', envelope); });
    room.onMessage('snapshot', (payload) => { this._emit('snapshot', payload); });
    room.onMessage('matchStarted', (info) => {
      this.phase = 'playing';
      if (info && info.mapSeed != null) this.mapSeed = info.mapSeed;
      this._emit('matchStarted', info || {});
      this._emit('phase', {
        phase: 'playing',
        inviteCode: this.inviteCode,
        isHost: this.isHost,
        side: this.side,
        mapSeed: this.mapSeed,
      });
    });
    room.onMessage('matchEnded', (info) => {
      this.phase = 'ended';
      this._emit('matchEnded', info || {});
      this._emit('phase', {
        phase: 'ended',
        inviteCode: this.inviteCode,
        isHost: this.isHost,
        side: this.side,
        end: info,
      });
    });

    room.onError((code, message) => {
      this._error(message || ('room error ' + code));
    });
    room.onLeave((code) => {
      this.multiplayer = false;
      this._emit('connection', false);
      console.info('[LunaciaNet] left room', code);
    });
  }

  async createRoom({ displayName, wallet, mapSeed, inviteCode } = {}) {
    await this.leave();
    this.endpoint = resolveEndpoint();
    this.client = new Client(this.endpoint);
    const opts = { displayName: displayName || 'Host' };
    if (wallet) opts.wallet = wallet;
    if (typeof mapSeed === 'number') opts.mapSeed = mapSeed;
    if (inviteCode) opts.inviteCode = String(inviteCode).toUpperCase();
    try {
      const room = await this.client.create('lunacia_rift', opts);
      this._wireRoom(room);
      this._syncFromState();
      return room;
    } catch (err) {
      this._error(err);
      throw err;
    }
  }

  async joinRoom({ inviteCode, displayName, wallet } = {}) {
    const code = String(inviteCode || '').trim().toUpperCase();
    if (code.length < 4) throw new Error('Enter a valid invite code');
    await this.leave();
    this.endpoint = resolveEndpoint();
    this.client = new Client(this.endpoint);
    const opts = { displayName: displayName || 'Guest', inviteCode: code };
    if (wallet) opts.wallet = wallet;

    try {
      const http = httpBaseFromWs(this.endpoint);
      const res = await fetch(http + '/invite/' + encodeURIComponent(code));
      if (res.ok) {
        const data = await res.json();
        if (data && data.roomId) {
          const room = await this.client.joinById(data.roomId, opts);
          this._wireRoom(room);
          this._syncFromState();
          return room;
        }
      }
    } catch (err) {
      console.warn('[LunaciaNet] invite lookup failed, trying join()', err);
    }

    try {
      const room = await this.client.join('lunacia_rift', opts);
      this._wireRoom(room);
      this._syncFromState();
      return room;
    } catch (err) {
      this._error(err);
      throw err;
    }
  }

  setReady(ready = true) {
    if (!this.room) return;
    this.room.send("ready", { ready: !!ready });
  }

  startMatch() {
    if (!this.room) return;
    this.room.send("startMatch");
  }

  sendCmd(payload) {
    if (!this.room || this.phase !== "playing") return;
    this.room.send("cmd", payload);
  }

  sendSnapshot(payload) {
    if (!this.room || this.phase !== "playing" || !this.isHost) return;
    this.room.send("snapshot", payload);
  }

  forfeit() {
    if (!this.room) return;
    if (this.phase === "playing") {
      try { this.room.send("forfeit"); } catch (_) {}
    }
  }

  matchEnd(opts) {
    const o = opts || {};
    if (!this.room || !this.isHost || this.phase !== "playing") return;
    this.room.send("matchEnd", {
      winnerSessionId: o.winnerSessionId || "",
      endReason: o.endReason || "nest_destroyed",
    });
  }

  async leave() {
    const room = this.room;
    this.room = null;
    this.multiplayer = false;
    this.sessionId = null;
    this.side = null;
    this.isHost = false;
    this.inviteCode = null;
    this.phase = "idle";
    this.players = [];
    if (room) {
      try { await room.leave(true); } catch (_) {}
    }
  }
}

export function createNet() {
  return new LunaciaNet();
}
