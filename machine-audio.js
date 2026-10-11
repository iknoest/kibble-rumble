/* KIBBLE RUMBLE '94 · NK-500R sound board — review prototype.
 *
 * Pure Web Audio synthesis: oscillators, FM, noise. No samples, no files, no network.
 * Every melody, bass line and stinger below was written for this prototype; nothing is
 * taken or transcribed from any existing game soundtrack.
 *
 * One authority: machine.js calls KRAudio.setState(state, ctx) from setState() and
 * KRAudio.event(e) from the same announce path that shows the banner. Nothing else
 * starts or stops music, so loops cannot stack.
 *
 * Signal path:  song bus ─┐
 *                         ├─ musicLevel → musicFilter → musicDuck → music(0.72) ─┐
 *               stingers ── sfx(0.95) ─────────────────────────────────────────┤
 *               clicks   ── ui(0.82) ──────────────────────────────────────────┼─ master → comp → out
 *               hum/hiss ── amb(0.6) ──────────────────────────────────────────┘
 */
(() => {
  "use strict";
  const LS_VOL = "kr94.vol", LS_MUTE = "kr94.muted";
  const A = {
    ctx: null, unlocked: false, nodes: null, cur: null, timer: 0, noise: null,
    want: { state: "off", ctx: {} }, applied: null, pos: {}, amb: null, ambKind: null,
    vol: 50, muted: false, logArr: [], duckUntil: 0, rec: null, onChange: null, live: 0,
  };
  try {
    const v = localStorage.getItem(LS_VOL); if (v != null && !Number.isNaN(+v)) A.vol = Math.max(0, Math.min(100, +v));
    A.muted = localStorage.getItem(LS_MUTE) === "1";
  } catch { /* storage optional */ }

  const mtof = (m) => 440 * Math.pow(2, (m - 69) / 12);
  const log = (kind, name) => { A.logArr.push({ t: +(performance.now() / 1000).toFixed(2), kind, name }); if (A.logArr.length > 400) A.logArr.shift(); };
  const masterLevel = () => (A.muted ? 0 : Math.pow(A.vol / 100, 1.6) * 0.9);

  /* ------------------------------------------------------------ graph */
  function build() {
    const c = A.ctx;
    const g = (v, dst) => { const n = c.createGain(); n.gain.value = v; if (dst) n.connect(dst); return n; };
    const comp = c.createDynamicsCompressor();
    comp.threshold.value = -14; comp.knee.value = 10; comp.ratio.value = 4; comp.attack.value = 0.004; comp.release.value = 0.2;
    comp.connect(c.destination);
    const master = g(masterLevel(), comp);
    const analyser = c.createAnalyser(); analyser.fftSize = 2048; comp.connect(analyser);
    const music = g(0.72, master), sfx = g(0.95, master), ui = g(0.82, master), amb = g(0.6, master);
    const musicDuck = g(1, music);
    const musicFilter = c.createBiquadFilter(); musicFilter.type = "lowpass"; musicFilter.frequency.value = 18000; musicFilter.Q.value = 0.7;
    musicFilter.connect(musicDuck);
    const musicLevel = g(1, musicFilter);
    A.nodes = { comp, master, analyser, music, sfx, ui, amb, musicDuck, musicFilter, musicLevel };
    const len = c.sampleRate;
    A.noise = c.createBuffer(1, len, c.sampleRate);
    const d = A.noise.getChannelData(0);
    for (let i = 0; i < len; i++) d[i] = Math.random() * 2 - 1;
  }

  /* ------------------------------------------------------------ instruments */
  function env(gain, t, a, peak, dur, r) {
    gain.gain.setValueAtTime(0.0001, t);
    gain.gain.linearRampToValueAtTime(peak, t + a);
    gain.gain.setValueAtTime(peak, t + Math.max(a, dur - r));
    gain.gain.exponentialRampToValueAtTime(0.0001, t + dur + 0.02);
  }
  function osc(dst, t, { type = "square", f, dur = 0.15, vel = 0.2, a = 0.004, r = 0.06, det = 0, vib = 0, glideTo = null }) {
    const c = A.ctx, o = c.createOscillator(), gn = c.createGain();
    o.type = type; o.frequency.setValueAtTime(f, t); o.detune.value = det;
    if (glideTo) o.frequency.exponentialRampToValueAtTime(glideTo, t + dur);
    if (vib) { const l = c.createOscillator(), lg = c.createGain(); l.frequency.value = 5.6; lg.gain.value = vib; l.connect(lg); lg.connect(o.frequency); l.start(t + 0.08); l.stop(t + dur + 0.1); }
    env(gn, t, a, vel, dur, r);
    o.connect(gn); gn.connect(dst); o.start(t); o.stop(t + dur + 0.08);
  }
  const lead = (dst, t, m, dur, vel = 0.11) => { osc(dst, t, { type: "square", f: mtof(m), dur, vel, vib: dur > 0.25 ? 4 : 0, r: 0.05 }); osc(dst, t, { type: "square", f: mtof(m), dur, vel: vel * 0.35, det: 9 }); };
  function fmBass(dst, t, m, dur, vel = 0.32) {
    const c = A.ctx, car = c.createOscillator(), mod = c.createOscillator(), mg = c.createGain(), gn = c.createGain(), f = mtof(m);
    car.type = "sine"; mod.type = "sine"; car.frequency.value = f; mod.frequency.value = f;
    mg.gain.setValueAtTime(f * 3.2, t); mg.gain.exponentialRampToValueAtTime(f * 0.6, t + Math.min(0.12, dur));
    mod.connect(mg); mg.connect(car.frequency);
    env(gn, t, 0.003, vel, dur, 0.04);
    car.connect(gn); gn.connect(dst); car.start(t); mod.start(t); car.stop(t + dur + 0.06); mod.stop(t + dur + 0.06);
  }
  function bell(dst, t, m, dur = 0.6, vel = 0.12, ratio = 3.5) {
    const c = A.ctx, car = c.createOscillator(), mod = c.createOscillator(), mg = c.createGain(), gn = c.createGain(), f = mtof(m);
    car.frequency.value = f; mod.frequency.value = f * ratio;
    mg.gain.setValueAtTime(f * 2.2, t); mg.gain.exponentialRampToValueAtTime(f * 0.05, t + dur);
    mod.connect(mg); mg.connect(car.frequency);
    gn.gain.setValueAtTime(0.0001, t); gn.gain.linearRampToValueAtTime(vel, t + 0.004); gn.gain.exponentialRampToValueAtTime(0.0001, t + dur);
    car.connect(gn); gn.connect(dst); car.start(t); mod.start(t); car.stop(t + dur + 0.05); mod.stop(t + dur + 0.05);
  }
  function brass(dst, t, notes, dur = 0.22, vel = 0.09, bright = 3200) {
    const c = A.ctx, f = c.createBiquadFilter(), gn = c.createGain();
    f.type = "lowpass"; f.Q.value = 2;
    f.frequency.setValueAtTime(380, t); f.frequency.linearRampToValueAtTime(bright, t + 0.03); f.frequency.exponentialRampToValueAtTime(700, t + dur);
    env(gn, t, 0.006, vel, dur, 0.07);
    f.connect(gn); gn.connect(dst);
    for (const m of notes) for (const d of [-7, 7]) { const o = c.createOscillator(); o.type = "sawtooth"; o.frequency.value = mtof(m); o.detune.value = d; o.connect(f); o.start(t); o.stop(t + dur + 0.08); }
  }
  function noise(dst, t, { dur = 0.1, vel = 0.2, type = "highpass", f = 6000, f2 = null, q = 0.8 }) {
    const c = A.ctx, s = c.createBufferSource(), flt = c.createBiquadFilter(), gn = c.createGain();
    s.buffer = A.noise; flt.type = type; flt.frequency.setValueAtTime(f, t); flt.Q.value = q;
    if (f2) flt.frequency.exponentialRampToValueAtTime(f2, t + dur);
    gn.gain.setValueAtTime(vel, t); gn.gain.exponentialRampToValueAtTime(0.0001, t + dur);
    s.connect(flt); flt.connect(gn); gn.connect(dst); s.start(t, Math.random() * 0.5); s.stop(t + dur + 0.02);
  }
  const kick = (d, t, v = 0.55) => { osc(d, t, { type: "sine", f: 150, glideTo: 42, dur: 0.16, vel: v, a: 0.002, r: 0.08 }); noise(d, t, { dur: 0.012, vel: 0.12, f: 3000 }); };
  const snare = (d, t, v = 0.28) => { noise(d, t, { dur: 0.13, vel: v, type: "bandpass", f: 1900, q: 0.6 }); osc(d, t, { type: "triangle", f: 190, glideTo: 150, dur: 0.07, vel: v * 0.6, a: 0.002 }); };
  const hat = (d, t, v = 0.07, open = false) => noise(d, t, { dur: open ? 0.16 : 0.035, vel: v, f: 8000 });
  const crash = (d, t, v = 0.12) => noise(d, t, { dur: 1.1, vel: v, f: 5200 });
  const tom = (d, t, m, v = 0.32) => osc(d, t, { type: "sine", f: mtof(m), glideTo: mtof(m - 5), dur: 0.18, vel: v, a: 0.002 });

  /* ------------------------------------------------------------ songs (original) */
  const Am = [45, 48, 52], F = [41, 45, 48], G = [43, 47, 50], Em = [40, 43, 47], E = [40, 44, 47];
  const Dm = [38, 41, 45], Bb = [34, 38, 41], C = [36, 40, 43], Amaj = [45, 49, 52];
  // race hook: bar → [[step, midi, len]] ; rising chord-tone motif, answered a step lower
  const RACE_LEAD = {
    0: [[0, 69, 2], [2, 72, 2], [4, 76, 4], [8, 74, 2], [10, 72, 2], [12, 69, 4]],
    1: [[0, 69, 2], [2, 72, 2], [4, 77, 6], [10, 76, 2], [12, 72, 4]],
    2: [[0, 71, 2], [2, 74, 2], [4, 79, 4], [8, 77, 2], [10, 76, 2], [12, 74, 4]],
    3: [[0, 76, 4], [4, 79, 2], [6, 83, 2], [8, 81, 4], [12, 79, 2], [14, 76, 2]],
    6: [[0, 71, 2], [2, 74, 2], [4, 79, 2], [6, 81, 2], [8, 83, 4], [12, 86, 4]],
    7: [[0, 80, 4], [4, 83, 4], [8, 88, 6]],
    8: [[0, 84, 2], [2, 81, 2], [4, 77, 2], [6, 81, 2], [8, 84, 4], [12, 86, 2], [14, 84, 2]],
    9: [[0, 83, 2], [2, 79, 2], [4, 74, 2], [6, 79, 2], [8, 83, 4], [12, 81, 4]],
    10: [[0, 81, 6], [6, 76, 2], [8, 81, 2], [10, 84, 2], [12, 88, 4]],
    11: [[0, 86, 2], [2, 84, 2], [4, 83, 2], [6, 81, 2], [8, 79, 2], [10, 76, 2], [12, 81, 4]],
    14: [[0, 80, 2], [2, 83, 2], [4, 88, 4], [8, 86, 2], [10, 83, 2], [12, 80, 4]],
    15: [[0, 76, 2], [2, 80, 2], [4, 83, 2], [6, 88, 2]],
  };
  RACE_LEAD[4] = RACE_LEAD[0]; RACE_LEAD[5] = RACE_LEAD[1]; RACE_LEAD[12] = RACE_LEAD[8]; RACE_LEAD[13] = RACE_LEAD[9];

  const SONGS = {
    /* READY / VS — D minor, half-time pedal, same rising motif played slowly */
    vs: {
      bpm: 126, bars: 8, prog: [Dm, Dm, Bb, C, Dm, Dm, Bb, Amaj],
      step(o, bar, s, t, ch) {
        if (s % 2 === 0) fmBass(o, t, 38 + (s % 8 === 6 ? 12 : 0), 0.12, s === 0 ? 0.34 : 0.22);
        if ([3, 6, 10].includes(s) && bar % 2 === 1) brass(o, t, ch.map((n) => n + 24), 0.16, 0.06);
        if (s === 0) kick(o, t, 0.5); if (s === 10) kick(o, t, 0.36); if (s === 8) snare(o, t, 0.24);
        if (s % 4 === 2) hat(o, t, 0.045);
        if (bar === 7 && s >= 12) tom(o, t, 50 - (s - 12) * 3, 0.26);
        if (bar === 0 && s === 0) crash(o, t, 0.07);
        const melody = { 1: [[0, 74, 6], [6, 77, 2], [8, 81, 8]], 3: [[0, 79, 4], [4, 76, 4], [8, 72, 8]], 5: [[0, 74, 6], [6, 77, 2], [8, 82, 8]], 7: [[0, 73, 4], [4, 76, 4], [8, 81, 8]] }[bar];
        for (const [st, m, len] of melody || []) if (st === s) lead(o, t, m, len * this.sd * 0.95, 0.08);
      },
    },
    /* REPLAY — A minor race loop, 16 bars A/B, driving octave bass */
    race: {
      bpm: 152, bars: 16, prog: [Am, F, G, Em, Am, F, G, E, F, G, Am, Am, F, G, E, E],
      step(o, bar, s, t, ch) {
        const r = ch[0];
        if (s % 2 === 0) fmBass(o, t, s % 4 === 0 ? r : r + 12, 0.1, s % 4 === 0 ? 0.33 : 0.24);
        if (s === 15) fmBass(o, t, r + 7, 0.05, 0.2);
        if (s % 4 === 0) kick(o, t, 0.52);
        if (bar >= 8 && s === 10) kick(o, t, 0.34);
        if (s === 4 || s === 12) snare(o, t, 0.3);
        hat(o, t, s % 2 ? 0.035 : 0.06, s === 14);
        if (s === 0 && (bar === 0 || bar === 8)) crash(o, t, 0.1);
        if ((bar === 7 || bar === 15) && s >= 12) { snare(o, t, 0.18 + (s - 12) * 0.04); tom(o, t, 52 - (s - 12) * 2, 0.22); }
        if (bar >= 8 && s % 2 === 1) osc(o, t, { type: "square", f: mtof(ch[(s >> 1) % 3] + 24), dur: 0.05, vel: 0.022 });
        for (const [st, m, len] of RACE_LEAD[bar] || []) if (st === s) lead(o, t, m, len * this.sd * 0.92, 0.1);
      },
    },
    /* ARCHIVE — F lydian, calm FM bells, tape-library browsing */
    menu: {
      bpm: 92, bars: 4, prog: [[41, 45, 48, 52], [43, 47, 50, 53], [40, 43, 47, 50], [41, 45, 48, 52]],
      step(o, bar, s, t, ch) {
        if (s % 2 === 0) bell(o, t, ch[(s >> 1) % 4] + 24, 0.5, s % 8 === 0 ? 0.07 : 0.045, 3.5);
        if (s === 0 || s === 8) fmBass(o, t, ch[0], 0.4, 0.16);
        if (s % 4 === 2) hat(o, t, 0.018);
        if (bar === 3 && s === 12) bell(o, t, 88, 0.9, 0.05, 2);
      },
    },
    /* RESULT · CLEAN MATCH — resolved C major cadence loop */
    resultClean: {
      bpm: 112, bars: 4, prog: [C, [33, 36, 40], F, G],
      step(o, bar, s, t, ch) {
        if (s === 0 || s === 8) fmBass(o, t, ch[0], 0.32, 0.22);
        if (s % 4 === 0) brass(o, t, ch.map((n) => n + 24), 0.12, 0.035, 2200);
        if (s === 4 || s === 12) snare(o, t, 0.14); if (s === 0) kick(o, t, 0.36); if (s % 2 === 0) hat(o, t, 0.025);
        const mel = { 0: [[0, 76, 4], [4, 74, 4], [8, 72, 8]], 1: [[0, 72, 4], [4, 76, 4], [8, 79, 8]], 2: [[0, 81, 4], [4, 79, 4], [8, 77, 8]], 3: [[0, 79, 4], [4, 83, 4], [8, 84, 8]] }[bar];
        for (const [st, m, len] of mel) if (st === s) bell(o, t, m, len * this.sd, 0.07, 2);
      },
    },
    /* RESULT · STEWARDS REVIEW / NO DECISION — suspended chords, a question that never resolves */
    resultContested: {
      bpm: 100, bars: 4, prog: [[36, 38, 43], [34, 36, 41], [36, 38, 43], [38, 43, 45]],
      step(o, bar, s, t, ch) {
        if (s === 0) fmBass(o, t, ch[0], 0.6, 0.2);
        if (s === 0 || s === 10) brass(o, t, ch.map((n) => n + 24), 0.3, 0.03, 1600);
        if (s % 4 === 2) hat(o, t, 0.022); if (s === 8) snare(o, t, 0.1);
        const mel = { 1: [[0, 74, 2], [2, 77, 2], [4, 74, 4]], 3: [[0, 72, 2], [2, 74, 2], [4, 79, 2], [6, 74, 6]] }[bar];
        for (const [st, m, len] of mel || []) if (st === s) bell(o, t, m, len * this.sd * 1.4, 0.06, 1.5);
      },
    },
  };
  for (const s of Object.values(SONGS)) s.sd = 60 / s.bpm / 4;   // seconds per 16th step

  /* ------------------------------------------------------------ sequencer (exactly one live loop) */
  function startSong(name) {
    if (A.cur && A.cur.name === name) return;               // continuity: same loop keeps running
    stopSong(0.25);
    const c = A.ctx, song = SONGS[name], out = c.createGain();
    out.gain.setValueAtTime(0.0001, c.currentTime); out.gain.linearRampToValueAtTime(1, c.currentTime + 0.12);
    out.connect(A.nodes.musicLevel);
    A.live++;
    // resume a loop at the bar where it was left (PAUSED→RESULT→back keeps the race moving forward)
    const step = (A.pos[name] || 0) - ((A.pos[name] || 0) % 16);
    A.cur = { name, song, out, step, next: c.currentTime + 0.06 };
    log("song", name);
    tick();
  }
  function stopSong(fade = 0.25) {
    const cur = A.cur;
    if (!cur) return;
    A.pos[cur.name] = cur.step;
    A.cur = null;
    const c = A.ctx, now = c.currentTime;
    cur.out.gain.cancelScheduledValues(now);
    cur.out.gain.setValueAtTime(cur.out.gain.value, now);
    cur.out.gain.linearRampToValueAtTime(0.0001, now + fade);
    setTimeout(() => { try { cur.out.disconnect(); } catch { /* already gone */ } A.live--; }, (fade + 0.6) * 1000);
    log("song-stop", cur.name);
  }
  function tick() {
    const cur = A.cur;
    if (!cur || !A.ctx) return;
    const ahead = A.ctx.currentTime + 0.14, total = cur.song.bars * 16;
    while (cur.next < ahead) {
      const i = cur.step % total, bar = Math.floor(i / 16), s = i % 16;
      cur.song.step(cur.out, bar, s, cur.next, cur.song.prog[bar]);
      cur.step = (cur.step + 1) % total;
      cur.next += cur.song.sd;
    }
  }

  /* ------------------------------------------------------------ music mood per state */
  function mood(freq, level, ms = 220) {
    const n = A.nodes, t = A.ctx.currentTime, s = ms / 1000;
    n.musicFilter.frequency.cancelScheduledValues(t); n.musicFilter.frequency.setValueAtTime(n.musicFilter.frequency.value, t);
    n.musicFilter.frequency.exponentialRampToValueAtTime(freq, t + s);
    n.musicLevel.gain.cancelScheduledValues(t); n.musicLevel.gain.setValueAtTime(n.musicLevel.gain.value, t);
    n.musicLevel.gain.linearRampToValueAtTime(level, t + s);
  }
  function duck(level, sec) {
    const g = A.nodes.musicDuck.gain, t = A.ctx.currentTime;
    g.cancelScheduledValues(t); g.setValueAtTime(g.value, t);
    g.linearRampToValueAtTime(level, t + 0.04); g.setValueAtTime(level, t + sec); g.linearRampToValueAtTime(1, t + sec + 0.35);
  }
  function ambience(kind) {
    if (A.ambKind === kind) return;
    if (A.amb) { const a = A.amb, t = A.ctx.currentTime; a.g.gain.setTargetAtTime(0.0001, t, 0.08); setTimeout(() => a.nodes.forEach((n) => { try { n.stop(); } catch { /* stopped */ } }), 600); }
    A.amb = null; A.ambKind = kind;
    if (!kind) return;
    const c = A.ctx, g = c.createGain(), nodes = [];
    g.gain.value = 0.0001; g.connect(A.nodes.amb);
    if (kind === "hum") {
      for (const [f, v] of [[60, 0.02], [120, 0.012], [15734, 0.0016]]) { const o = c.createOscillator(), og = c.createGain(); o.frequency.value = f; og.gain.value = v; o.connect(og); og.connect(g); o.start(); nodes.push(o); }
      g.gain.setTargetAtTime(1, c.currentTime, 0.3);
    } else {               // static: tape hiss + signal noise, no music
      const s = c.createBufferSource(), f = c.createBiquadFilter(); s.buffer = A.noise; s.loop = true; f.type = "bandpass"; f.frequency.value = 3200; f.Q.value = 0.4;
      s.connect(f); f.connect(g); s.start(); nodes.push(s);
      const o = c.createOscillator(), og = c.createGain(); o.frequency.value = 60; og.gain.value = 0.02; o.connect(og); og.connect(g); o.start(); nodes.push(o);
      g.gain.setTargetAtTime(0.11, c.currentTime, 0.15);
    }
    A.amb = { g, nodes };
  }

  function apply(state, ctx = {}) {
    if (!A.unlocked) return;
    const prev = A.applied;
    A.applied = state;
    log("state", state);
    switch (state) {
      case "off":
        stopSong(0.12); ambience(null); break;
      case "boot":
        stopSong(0.1); ambience("hum"); mood(18000, 1, 60);
        if (prev !== "boot") jingle(); break;
      case "ready":
        ambience("hum"); mood(18000, 1); startSong("vs"); break;
      case "replay":
        ambience("hum"); startSong("race"); mood(18000, 1, 260); break;
      case "paused":
        ambience("hum"); startSong("race"); mood(700, 0.55, 260); break;
      case "still":
        ambience("hum"); startSong("race"); mood(520, 0.48, 200); shutter(); break;
      case "postmatch":                       // MATCH COMPLETE: race loop out, finish fanfare, then a quiet wait
        ambience("hum"); stopSong(0.3); mood(18000, 1, 60);
        if (prev !== "postmatch") complete();
        break;
      case "result": {
        ambience("hum"); mood(18000, 1, 120);
        // a decided game resolves; NO CONTEST stays unresolved. Canonical CLEAN/STEWARDS labels are not re-scored.
        const clean = ctx.game ? ctx.game !== "NO_CONTEST" : ctx.result === "CLEAN MATCH";
        if (prev !== "result") resultSting(clean);
        stopSong(0.15);
        setTimeout(() => { if (A.applied === "result") startSong(clean ? "resultClean" : "resultContested"); }, 1250);
        break;
      }
      case "archive":
        ambience("hum"); mood(18000, 1); startSong("menu"); break;
      case "nosignal":
        stopSong(0.3); ambience("static"); break;
      default:
        break;
    }
  }

  /* ------------------------------------------------------------ one-shots */
  const T = () => A.ctx.currentTime + 0.01;
  function jingle() {
    const d = A.nodes.sfx, t = T();
    osc(d, t, { type: "sine", f: 55, glideTo: 30, dur: 0.35, vel: 0.35, a: 0.002 });          // relay thump
    noise(d, t, { dur: 0.5, vel: 0.08, type: "lowpass", f: 400, f2: 80 });                      // degauss
    osc(d, t + 0.05, { type: "sine", f: 15000, glideTo: 15734, dur: 0.4, vel: 0.01 });
    osc(d, t + 0.45, { type: "square", f: mtof(83), dur: 0.07, vel: 0.12 });                     // coin "ding-ding"
    osc(d, t + 0.53, { type: "square", f: mtof(88), dur: 0.22, vel: 0.12 });
    [72, 76, 79, 84, 88].forEach((m, i) => lead(d, t + 0.9 + i * 0.075, m, 0.09, 0.09));
    brass(d, t + 1.3, [60, 64, 67, 72], 0.7, 0.08, 3600);
    fmBass(d, t + 1.3, 36, 0.6, 0.3); crash(d, t + 1.3, 0.1); kick(d, t + 1.3, 0.45);
    log("sting", "boot");
  }
  function resultSting(clean) {
    const d = A.nodes.sfx, t = T();
    noise(d, t, { dur: 0.35, vel: 0.1, type: "bandpass", f: 500, f2: 6000, q: 1.2 });          // reveal whoosh
    if (clean) {
      [60, 64, 67, 72].forEach((m, i) => brass(d, t + 0.25 + i * 0.09, [m + 12], 0.12, 0.08));
      brass(d, t + 0.65, [60, 64, 67, 72], 0.55, 0.09, 3600); kick(d, t + 0.65); crash(d, t + 0.65, 0.1);
    } else {
      brass(d, t + 0.25, [60, 64, 67], 0.2, 0.08); brass(d, t + 0.5, [66, 70, 73], 0.25, 0.08); // tritone shift
      [76, 75, 74].forEach((m, i) => lead(d, t + 0.85 + i * 0.12, m, 0.11, 0.08));               // quizzical slide
      lead(d, t + 1.25, 74, 0.18, 0.07);
    }
    duck(0.2, 1.1);
    log("sting", clean ? "result-clean" : "result-contested");
  }
  function complete() {
    const d = A.nodes.sfx, t = T();
    [72, 74, 76, 79, 81, 84, 88].forEach((m, i) => lead(d, t + i * 0.055, m, 0.06, 0.08));   // checkered run
    brass(d, t + 0.42, [60, 64, 67, 72], 0.9, 0.09, 3600); fmBass(d, t + 0.42, 36, 0.8, 0.3);
    crash(d, t + 0.42, 0.12); kick(d, t + 0.42, 0.5);
    bell(d, t + 1.1, 96, 1.2, 0.07, 2);
    log("sting", "match-complete");
  }
  function shutter() {
    const d = A.nodes.ui, t = T();
    noise(d, t, { dur: 0.04, vel: 0.25, f: 2500 }); noise(d, t + 0.06, { dur: 0.05, vel: 0.18, f: 3500 });
    osc(d, t + 0.05, { type: "square", f: 2600, dur: 0.05, vel: 0.05 });
    log("sfx", "shutter");
  }

  const STINGS = {
    food_dispensed(d, t) { [0, 0.26, 0.52].forEach((x) => osc(d, t + x, { type: "square", f: mtof(81), dur: 0.1, vel: 0.1 })); osc(d, t + 0.78, { type: "square", f: mtof(93), dur: 0.32, vel: 0.11 }); },
    cat_arrival(d, t, e) {
      const cat = (e.cat || "").toLowerCase(), base = cat === "dan" ? 72 : cat === "sanbo" ? 74 : 69;
      const steps = cat === "dan" ? [0, 4, 7, 12] : cat === "sanbo" ? [0, 4, 7, 11, 14] : [0, 7, 12];
      steps.forEach((s, i) => lead(d, t + i * 0.06, base + s, 0.09, 0.09));
    },
    foreign_arrival(d, t) {                // TAKEOVER: urgent tritone warble + low hit
      for (let i = 0; i < 8; i++) osc(d, t + i * 0.07, { type: "square", f: mtof(i % 2 ? 83 : 77), dur: 0.06, vel: 0.12 });
      brass(d, t, [38, 44, 50], 0.5, 0.12, 2400); kick(d, t, 0.6);
      noise(d, t + 0.05, { dur: 0.6, vel: 0.1, type: "bandpass", f: 800, f2: 5000, q: 2 });
      brass(d, t + 0.62, [62, 68, 74], 0.42, 0.1, 3800); crash(d, t + 0.62, 0.11);
      duck(0.35, 1.15);
    },
    meal_finish(d, t) {
      [72, 74, 76, 79, 81, 84].forEach((m, i) => lead(d, t + i * 0.05, m, 0.06, 0.08));
      bell(d, t + 0.32, 96, 0.8, 0.09, 2); crash(d, t + 0.32, 0.1); duck(0.6, 0.9);
    },
    return_to_feeder(d, t) { lead(d, t, 79, 0.1, 0.09); lead(d, t + 0.12, 84, 0.24, 0.09); },
    feeder_departure(d, t) { osc(d, t, { type: "triangle", f: mtof(60), glideTo: mtof(55), dur: 0.14, vel: 0.08 }); },
  };
  let lastSting = 0;

  /* ------------------------------------------------------------ public API */
  const KRAudio = {
    unlocked: () => A.unlocked,
    unlock() {
      if (A.unlocked) { if (A.ctx.state === "suspended") A.ctx.resume(); return; }
      try {
        A.ctx = new (window.AudioContext || window.webkitAudioContext)();
        build();
        A.ctx.resume();
        A.unlocked = true;
        A.timer = setInterval(tick, 25);
        log("unlock", A.ctx.state);
        // join whatever state the machine is already in (a page auto-powered with ?on starts its VS loop now)
        apply(A.want.state, A.want.ctx);
        A.onChange && A.onChange();
      } catch (err) { console.warn("audio unavailable", err); }
    },
    setState(state, ctx = {}) { A.want = { state, ctx }; apply(state, ctx); A.onChange && A.onChange(); },
    event(e, opts = {}) {
      if (!A.unlocked || !STINGS[e.type]) return;            // only canonical event types have cues
      const now = A.ctx.currentTime, t = Math.max(now + 0.01, lastSting + 0.3);   // simultaneous events chain, never pile up
      lastSting = t;
      const dst = A.ctx.createGain(); dst.gain.value = opts.soft ? 0.6 : 1; dst.connect(A.nodes.sfx);
      STINGS[e.type](dst, t, e);
      setTimeout(() => { try { dst.disconnect(); } catch { /* gone */ } }, 3000);
      log("event", e.type);
    },
    ui(name, heavy) {
      if (!A.unlocked) return;
      if (String(name).startsWith("bet-")) log("bet", name);
      const d = A.nodes.ui, t = T();
      switch (name) {
        case "key": noise(d, t, { dur: heavy ? 0.03 : 0.018, vel: heavy ? 0.22 : 0.16, f: heavy ? 1200 : 2600 }); osc(d, t, { type: "sine", f: heavy ? 90 : 140, dur: 0.03, vel: heavy ? 0.12 : 0.06, a: 0.001 }); break;
        case "pad": noise(d, t, { dur: 0.014, vel: 0.12, f: 3800 }); osc(d, t, { type: "sine", f: 220, dur: 0.02, vel: 0.05, a: 0.001 }); break;
        case "tick": osc(d, t, { type: "square", f: 1180, dur: 0.035, vel: 0.05 }); break;
        case "confirm": osc(d, t, { type: "square", f: mtof(84), dur: 0.05, vel: 0.06 }); osc(d, t + 0.05, { type: "square", f: mtof(91), dur: 0.08, vel: 0.06 }); break;
        case "eject": osc(d, t, { type: "sawtooth", f: 70, glideTo: 52, dur: 0.38, vel: 0.06 }); noise(d, t + 0.36, { dur: 0.06, vel: 0.22, f: 900 }); osc(d, t + 0.36, { type: "sine", f: 80, glideTo: 50, dur: 0.08, vel: 0.2 }); break;
        case "load": noise(d, t, { dur: 0.05, vel: 0.22, f: 900 }); osc(d, t, { type: "sine", f: 90, glideTo: 50, dur: 0.09, vel: 0.22 }); osc(d, t + 0.08, { type: "sawtooth", f: 55, glideTo: 75, dur: 0.3, vel: 0.05 }); break;
        case "seek": noise(d, t, { dur: 0.2, vel: 0.12, type: "bandpass", f: heavy ? 3500 : 900, f2: heavy ? 900 : 3500, q: 1.5 }); break;
        case "nav": osc(d, t, { type: "square", f: mtof(heavy ? 79 : 86), dur: 0.04, vel: 0.05 }); break;
        case "bet-win": [76, 79, 84, 88].forEach((m, i) => lead(d, t + i * 0.08, m, 0.1, 0.09)); bell(d, t + 0.34, 100, 0.7, 0.07, 2); break;
        case "bet-lose": [67, 66, 65].forEach((m, i) => osc(d, t + i * 0.16, { type: "square", f: mtof(m), glideTo: mtof(m - 0.6), dur: 0.15, vel: 0.08 })); osc(d, t + 0.5, { type: "square", f: mtof(62), glideTo: mtof(58), dur: 0.5, vel: 0.08, vib: 6 }); break;
        case "bet-void": osc(d, t, { type: "square", f: mtof(72), dur: 0.08, vel: 0.06 }); osc(d, t + 0.12, { type: "square", f: mtof(72), dur: 0.08, vel: 0.06 }); break;
        case "bet-none": osc(d, t, { type: "square", f: mtof(79), dur: 0.06, vel: 0.05 }); break;
        case "power-off": osc(d, t, { type: "sine", f: 15734, glideTo: 4000, dur: 0.35, vel: 0.02 }); noise(d, t, { dur: 0.04, vel: 0.2, f: 1500 }); osc(d, t, { type: "sine", f: 70, glideTo: 35, dur: 0.12, vel: 0.15 }); break;
        default: break;
      }
    },
    print() {                                  // dot-matrix ticket + paper feed, music ducked then restored
      if (!A.unlocked) return;
      const d = A.nodes.sfx, t = T();
      duck(0.3, 1.5);
      for (let line = 0; line < 3; line++) for (let i = 0; i < 9; i++) noise(d, t + line * 0.42 + i * 0.034, { dur: 0.018, vel: 0.13, type: "bandpass", f: 2800 + (i % 3) * 400, q: 3 });
      [0.36, 0.78, 1.2].forEach((x) => osc(d, t + x, { type: "sawtooth", f: 48, glideTo: 60, dur: 0.07, vel: 0.06 }));
      log("sfx", "print");
    },
    setVolume(v) {
      A.vol = Math.max(0, Math.min(100, Math.round(v)));
      if (A.vol > 0) A.muted = false;
      persist(); level();
    },
    toggleMute() {
      if (A.muted || A.vol === 0) { A.muted = false; if (A.vol === 0) A.vol = A.lastVol || 50; }
      else { A.lastVol = A.vol; A.muted = true; }
      persist(); level();
      return A.muted;
    },
    volume: () => A.vol, muted: () => A.muted || A.vol === 0,
    audible: () => A.unlocked && !(A.muted || A.vol === 0) && A.ctx && A.ctx.state === "running",
    song: () => (A.cur ? A.cur.name : null),
    meter() {
      if (!A.unlocked) return { rms: 0 };
      const buf = new Float32Array(A.nodes.analyser.fftSize); A.nodes.analyser.getFloatTimeDomainData(buf);
      let s = 0; for (const x of buf) s += x * x; return { rms: Math.sqrt(s / buf.length) };
    },
    log: () => A.logArr.slice(),
    debug: () => ({ live: A.live, song: A.cur ? A.cur.name : null, applied: A.applied, amb: A.ambKind,
      filter: A.unlocked ? Math.round(A.nodes.musicFilter.frequency.value) : null, level: A.unlocked ? +A.nodes.musicLevel.gain.value.toFixed(2) : null,
      master: A.unlocked ? +A.nodes.master.gain.value.toFixed(3) : null, ctx: A.ctx ? A.ctx.state : "none" }),
    /* review capture: record the page's own audio output (post master) */
    startCapture() {
      if (!A.unlocked) return false;
      const dst = A.ctx.createMediaStreamDestination(); A.nodes.comp.connect(dst);
      const chunks = [], rec = new MediaRecorder(dst.stream, { mimeType: "audio/webm;codecs=opus" });
      rec.ondataavailable = (ev) => ev.data.size && chunks.push(ev.data); rec.start(250);
      A.rec = { rec, chunks, dst, t0: performance.now() };
      return A.rec.t0;
    },
    async stopCapture() {
      const r = A.rec; if (!r) return null;
      await new Promise((res) => { r.rec.onstop = res; r.rec.stop(); });
      const blob = new Blob(r.chunks, { type: "audio/webm" }), buf = new Uint8Array(await blob.arrayBuffer());
      let bin = ""; for (let i = 0; i < buf.length; i += 0x8000) bin += String.fromCharCode.apply(null, buf.subarray(i, i + 0x8000));
      A.rec = null; return { t0: r.t0, b64: btoa(bin) };
    },
  };
  function level() {
    if (A.unlocked) { const g = A.nodes.master.gain, t = A.ctx.currentTime; g.cancelScheduledValues(t); g.setTargetAtTime(masterLevel(), t, 0.03); }
    A.onChange && A.onChange();
  }
  function persist() { try { localStorage.setItem(LS_VOL, String(A.vol)); localStorage.setItem(LS_MUTE, A.muted ? "1" : "0"); } catch { /* optional */ } }

  // Browsers allow audio only after a user gesture: the first pointer/key/touch unlocks it.
  const unlockOnce = () => { KRAudio.unlock(); };
  for (const ev of ["pointerdown", "keydown", "touchstart"]) window.addEventListener(ev, unlockOnce, { capture: true, passive: true });

  window.KRAudio = KRAudio;
})();
