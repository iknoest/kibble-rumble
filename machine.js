/* KIBBLE RUMBLE '94 · NK-500R replay machine — review prototype logic.
 * Every fact shown comes from window.KR_DATA (built from canonical reports by
 * build_machine_data.py). Footage = the real combined replay, drawn 1:1 into its
 * two original 16:9 camera lanes (never stretched, never cropped inside a lane). */
(() => {
  "use strict";
  const DATA = window.KR_DATA;
  const $ = (s, r = document) => r.querySelector(s);
  const $$ = (s, r = document) => [...r.querySelectorAll(s)];
  const RESULT_PAGES = 4;               // OUTCOME · MATCH MEMORIES · MATCH STATS · REACTION
  const machine = $("#machine"), screen = $("#screen"), video = $("#src-video");
  const bootEl = $("#s-boot"), osdEl = $("#osd"), toastEl = $("#toast");
  const ctx = { tapo: $("#cv-tapo").getContext("2d"), logi: $("#cv-logi").getContext("2d"), bar: $("#cv-bar").getContext("2d") };
  const REPLAY_STATES = new Set(["replay", "paused", "still"]);
  const SKIP_S = 15;                         // REW / FF jump, in wall-clock seconds

  const S = {
    power: false, state: "off", dayIdx: 0, day: null, slow: false,
    blobs: {}, videoReady: null, lastClock: null, evCursor: null, bootTok: 0, arSel: 0, arTab: 0, fighterSub: 0,
    archiveReturn: "ready", resultReturn: "ready", hudKey: "", osdTimer: 0, toastTimer: 0,
    listeners: [], cursor: null, resPage: 0, tl: null,
  };
  const REPLAYISH = new Set(["replay", "paused", "still", "postmatch"]);
  const AUDIO = window.KRAudio || { setState() {}, event() {}, ui() {}, print() {}, unlocked: () => false, audible: () => false };
  const FILE_MODE = location.protocol === "file:";   // browsers block the MP4 fetch from file://

  /* ------------------------------------------------------------ helpers */
  const sleep = (ms) => new Promise((r) => setTimeout(r, ms));
  const pad = (n) => String(n).padStart(2, "0");
  const hms = (s) => { s = Math.max(0, Math.round(s)); return `${pad(Math.floor(s / 3600))}:${pad(Math.floor(s % 3600 / 60))}:${pad(s % 60)}`; };
  const formatRelTime = (s) => {
    if (s < 0) return "PRE-MATCH";
    s = Math.max(0, Math.round(s));
    return "T+" + pad(Math.floor(s / 60)) + ":" + pad(Math.floor(s % 60));
  };
  const stewardResult = (d) => {
    if (!d) return { label: "NO DATA", tone: "white", sub: "" };
    if (d.stewards_result) return d.stewards_result;
    if (d.result && typeof d.result === "object") return d.result;
    const conf = d.stewards === "REVIEW" || (d.facts && d.facts.attribution_contested);
    return {
      label: conf ? "STEWARDS REVIEW" : "CLEAN MATCH",
      tone: conf ? "amber" : "green",
      sub: conf ? (d.stewards_detail || "ATTRIBUTION CONTESTED") : "NO INCIDENT · NO WINNER DECLARED"
    };
  };
  const esc = (t) => String(t ?? "").replace(/[&<>"]/g, (c) => ({ "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;" }[c]));
  const approx = (n) => (n == null ? "?" : n === 0 ? "0" : `~${n}`);
  const secsFloor = (x) => (x == null ? "?" : `${Math.floor(x)}s`);
  const hasVideo = () => !!(S.day && S.day.video);
  const clockAt = (t) => S.day.video.clock_t0 + S.day.video.speed * t;
  const tAt = (clock) => (clock - S.day.video.clock_t0) / S.day.video.speed;
  const nowClock = () => (hasVideo() ? clockAt(video.currentTime || 0) : S.day.window.t0);
  /* ONE timeline authority, shared with the pipeline's burned-in bar: report-window start →
   * report-window end + 15 s (see build_machine_data.TIMELINE_TAIL_S). Playhead, event pips,
   * source gaps and click-seek all use it; the wall clock itself comes from clockAt(t). */
  const TL = () => ({ c0: S.day.timeline.t0, c1: S.day.timeline.t1 });
  const tlFrac = (clock) => { const t = TL(); return Math.min(1, Math.max(0, (clock - t.c0) / Math.max(1, t.c1 - t.c0))); };

  /* ------------------------------------------------------------ game layer (presentation only)
   * The game outcome is separate from the canonical evidence verdict and never rewrites it. */
  /* GAME LAYER (presentation). Household rule (Ava, v10.4): when Sanbo enters Dan's bowl she is there to eat
   * Dan's food, so ENTERING = a successful raid. Kept strictly apart from the canonical STEWARD / EVIDENCE layer
   * (d.result: CLEAN MATCH / STEWARDS REVIEW / NO DECISION, theft verdict, attribution), which describes
   * computer-vision certainty, is never changed, and is always shown beside the game result.
   *   SANBO WIN · RAID SUCCESS — a canonical TAPO foreign_arrival of Sanbo at Dan's feeder (contested attribution or
   *                              a "Not confirmed" theft verdict do NOT downgrade this).
   *   DAN WIN · DEFENDED       — Sanbo never entered Dan's bowl (event log, or for older event-less reports a TAPO
   *                              summary that never saw Sanbo) and Dan cleared his bowl.
   *   NO CONTEST               — genuinely unresolved: no event log and the summary cannot rule a raid in or out,
   *                              or the breakfast outcome itself is unavailable.
   * Dan entering Sanbo's feeder (canonical LOGITECH event, cat Dan/both) is a BONUS event, never a winner override.
   * Decided by evidence pattern only — no calendar dates. */
  function gameOutcome(d) {
    const f = d.facts || {};
    const raid = d.events.find((e) => e.type === "foreign_arrival" && e.cat === "Sanbo" && e.camera === "TAPO");
    const bonus = bonusEvent(d, raid);
    if (raid)
      return { id: "SANBO_WIN", label: "SANBO WIN", winner: "sanbo", basis: "RAID SUCCESS", bonus,
        rule: `SANBO ENTERED DAN'S BOWL AT ${raid.time}. HOUSE RULE: ENTERING DAN'S BOWL IS A SUCCESSFUL RAID.` };
    if (f.sanbo_never_at_dan_feeder && f.dan_bowl_cleared)
      return { id: "DAN_WIN", label: "DAN WIN", winner: "dan", basis: "DEFENDED", bonus,
        rule: "SANBO NEVER ENTERED DAN'S BOWL AND DAN CLEARED HIS BREAKFAST." };
    const why = !f.event_log && !f.sanbo_never_at_dan_feeder
      ? "THIS OLDER REPORT HAS NO EVENT LOG, SO WHETHER SANBO ENTERED DAN'S BOWL CANNOT BE DETERMINED (A MODEL SPLIT ALONE IS NOT ENOUGH)."
      : !f.dan_bowl_cleared ? "SANBO NEVER ENTERED, BUT DAN'S BREAKFAST WAS NOT COMPLETED." : "THE MATCH STATE IS UNRESOLVED.";
    return { id: "NO_CONTEST", label: "NO CONTEST", winner: null, basis: "UNRESOLVED", bonus, rule: why };
  }
  /* Dan in Sanbo's feeder: COUNTER RAID when it follows a Sanbo raid, otherwise DAN RAID. Secondary only. */
  function bonusEvent(d, raid) {
    const e = d.events.find((x) => x.camera === "LOGITECH" && ["dan", "both"].includes((x.cat || "").toLowerCase()) && ["cat_arrival", "foreign_arrival"].includes(x.type));
    if (!e) return null;
    const counter = !!raid && e.t >= raid.t;
    return { time: e.time, kind: counter ? "COUNTER RAID" : "DAN RAID", label: counter ? "DAN COUNTER-RAIDED SANBO" : "DAN RAIDED SANBO" };
  }
  function betVerdict(outcome, pick) {
    if (outcome.id === "NO_CONTEST") return { id: "void", text: "BET VOID · NO CONTEST", tone: "white" };
    if (!pick) return { id: "none", text: "NO BET PLACED", tone: "white" };
    return pick === outcome.winner ? { id: "win", text: "YOU CALLED IT!", tone: "green" } : { id: "lose", text: "YOU LOST THE BET", tone: "red" };
  }
  function ensureReactionRules() {
    const R = DATA.reaction_registry;
    if (!R || !R.rules) return;
    const rIds = new Set(R.rules.map((r) => r.id));
    if (!rIds.has("sanbo-win-you-backed-sanbo")) {
      R.rules.splice(1, 0, {
        id: "sanbo-win-you-backed-sanbo",
        when: { game: "SANBO_WIN", pick: "sanbo" },
        primary: "sanbo-sunglasses",
        label: "YOU CALLED THE RAID!",
        why: "Sanbo entered Dan's bowl and you backed Sanbo. Deal with it."
      });
    }
    if (!rIds.has("no-contest-you-backed-sanbo")) {
      R.rules.splice(R.rules.length - 1, 0, {
        id: "no-contest-you-backed-sanbo",
        when: { game: "NO_CONTEST", pick: "sanbo" },
        primary: "sanbo-huh",
        label: "PUZZLED RAIDER",
        why: "The match state is unresolved and you backed Sanbo."
      });
    }
    const evIds = new Set((R.event_reactions || []).map((e) => e.id));
    if (!evIds.has("dan-raid-bonus")) {
      (R.event_reactions = R.event_reactions || []).unshift({
        id: "dan-raid-bonus",
        when: { fact: "takeover_by_dan" },
        asset: "dan-take-some",
        label: "BONUS EVENT · DAN RAID",
        why: "Dan raided Sanbo's feeder in the foreign lane."
      });
    }
  }

  function pickReaction(d, outcome, pick) {
    ensureReactionRules();
    const R = DATA.reaction_registry, f = d.facts || {};
    const fits = (w) => (!w.game || w.game === outcome.id) && (!w.basis || w.basis === outcome.basis) && (!w.pick || w.pick === pick) && (!w.fact || f[w.fact]);
    const rule = R.rules.find((r) => fits(r.when)) || null;
    const asset = rule ? R.assets.find((a) => a.id === rule.primary) : null;
    const ev = (R.event_reactions || []).find((e) => fits(e.when) && (!asset || e.asset !== asset.id));
    return { rule, asset, event: ev ? { ...ev, a: R.assets.find((a) => a.id === ev.asset) } : null };
  }
  /* the visitor's prediction: local entertainment state only, per tape, never in any report */
  const PRED_KEY = (date) => `kr94.pred.${date}`;
  function pred(date = S.day.date) {
    try { return Object.assign({ pick: null, locked: false, revealed: false }, JSON.parse(localStorage.getItem(PRED_KEY(date)) || "{}")); }
    catch { return { pick: null, locked: false, revealed: false }; }
  }
  function savePred(pr, date = S.day.date) { try { localStorage.setItem(PRED_KEY(date), JSON.stringify(pr)); } catch { /* optional */ } }
  const ICON = {
    check: '<svg width="1em" height="1em" viewBox="0 0 16 16"><path d="M2 8.6 L6.2 12.6 L14.2 3.6" stroke="currentColor" stroke-width="2.8" fill="none"/></svg>',
    warn: '<svg width="1em" height="1em" viewBox="0 0 16 16"><path d="M8 1 L15.5 14.8 H0.5 Z" fill="currentColor"/><rect x="7" y="5.4" width="2" height="5.2" fill="#140a00"/><rect x="7" y="11.8" width="2" height="2" fill="#140a00"/></svg>',
    q: '<svg width="1em" height="1em" viewBox="0 0 16 16"><circle cx="8" cy="8" r="7.4" fill="currentColor"/><path d="M5.6 6.1 C5.6 3.2 10.6 3.2 10.6 6 C10.6 7.8 8.3 8 8.3 10" stroke="#140a00" stroke-width="2" fill="none"/><rect x="7.2" y="11.3" width="2.1" height="2.1" fill="#140a00"/></svg>',
    play: '<svg width="1em" height="1em" viewBox="0 0 16 16"><path d="M3 1.5 L14 8 L3 14.5 Z" fill="currentColor"/></svg>',
    tape: '<svg width="1em" height="1em" viewBox="0 0 16 16"><rect x="1" y="3" width="14" height="10" rx="1" fill="none" stroke="currentColor" stroke-width="1.6"/><circle cx="5" cy="8" r="1.8" fill="currentColor"/><circle cx="11" cy="8" r="1.8" fill="currentColor"/></svg>',
  };

  /* Event vocabulary: report event → game event. P1 = DAN, P2 = SANBO (the cats). */
  function evInfo(e) {
    const cat = (e.cat || "").toLowerCase();
    const lane = e.camera === "TAPO" ? 1 : 2;
    const who = cat === "dan" ? "P1 DAN" : cat === "sanbo" ? "P2 SANBO" : cat === "both" ? "BOTH CATS" : "";
    switch (e.type) {
      case "food_dispensed":
        return { big: "KIBBLE DROP!", sub: e.notes.toUpperCase() + " · DAN FEEDER", tone: "white", lane, short: "FOOD DISPENSED" };
      case "cat_arrival":
        if ((cat === "both" || cat === "dan") && e.camera === "LOGITECH") {        // Dan in Sanbo's feeder: bonus event
          const b = bonusEvent(S.day, S.day.events.find((x) => x.type === "foreign_arrival" && x.cat === "Sanbo" && x.camera === "TAPO"));
          return { big: b && b.kind === "COUNTER RAID" ? "COUNTER RAID!" : "DAN RAID!", sub: "P1 DAN ENTERED P2 SANBO'S LANE", tone: "p1", lane, short: b ? b.kind : "DAN RAID" };
        }
        if (cat === "both") return { big: "BOTH CATS IN", sub: (e.feeder || "").toUpperCase(), tone: "p2", lane, short: "BOTH ARRIVE" };
        return { big: `${who} ENTERS`, sub: `HOME LANE · ${(e.feeder || "").toUpperCase()}`, tone: cat === "dan" ? "p1" : "p2", lane, short: `${cat.toUpperCase()} ARRIVES` };
      case "foreign_arrival": {
        const victim = lane === 1 ? "P1 DAN'S LANE" : "P2 SANBO'S LANE";
        // a raid ATTEMPT: reaching the other cat's bowl. Whether food was eaten is decided by the evidence layer, not here.
        return { big: lane === 1 ? "RAID!" : "TAKEOVER!", sub: `${who} ENTERED ${victim}`, tone: "red", lane, short: `${cat.toUpperCase()} IN ${lane === 1 ? "DAN'S" : "SANBO'S"} LANE` };
      }
      case "feeder_departure":
        return { big: `${who} LEAVES`, sub: (e.feeder || "").toUpperCase(), tone: "white", lane, short: `${cat.toUpperCase()} LEAVES` };
      case "meal_finish":
        return { big: "MEAL FINISHED!", sub: `${(e.feeder || "DAN FEEDER").toUpperCase()} CLEARED · AT BOWL: ${cat.toUpperCase()}`, tone: "green", lane, short: "BOWL CLEARED" };
      case "return_to_feeder":
        return { big: "BACK HOME", sub: `${who} RETURNED TO OWN LANE`, tone: "blue", lane, short: "SANBO RETURNS" };
      default:
        return { big: (e.type || "EVENT").toUpperCase(), sub: e.notes.toUpperCase(), tone: "white", lane, short: (e.type || "").toUpperCase() };
    }
  }
  const PIP = { food_dispensed: "#ffffff", cat_arrival: null, foreign_arrival: "#ff3b30", feeder_departure: "#8f9bc7", meal_finish: "#3dff7a", return_to_feeder: "#4d8dff" };
  const pipColor = (e) => PIP[e.type] || ((e.cat || "").toLowerCase() === "dan" ? "#ffd23a" : "#56dcff");

  /* ------------------------------------------------------------ sound (machine-audio.js) */
  const click = (heavy) => AUDIO.ui("key", heavy);

  /* ------------------------------------------------------------ state */
  function setState(st) {
    const prev = S.state;
    S.state = st;
    // PLAY starting the match is the ONLY thing that locks the prediction (state → replay). Picking, re-picking,
    // clicking tiles, loading tapes or visiting READY never lock; transport keys cannot reach the footage before PLAY.
    if (st === "replay" && S.day) {
      const pr = pred();
      if (!pr.locked) { pr.locked = true; savePred(pr); S.lockNote = `PREDICTION LOCKED · ${pr.pick ? pr.pick.toUpperCase() : "NO BET"}`; osd(S.lockNote, 1800); }
    }
    machine.dataset.state = st;
    screen.dataset.state = st;
    const sOff = $("#s-off");
    if (sOff) {
      if (st === "off") {
        sOff.setAttribute("tabindex", "0");
        sOff.removeAttribute("aria-hidden");
      } else {
        sOff.setAttribute("tabindex", "-1");
        sOff.setAttribute("aria-hidden", "true");
      }
    }
    S.hudKey = "";
    // the only place music changes: the soundtrack follows the machine state
    AUDIO.setState(st, { result: S.day ? S.day.result.label : null, game: S.day ? gameOutcome(S.day).id : null });
    refresh();
    if (st === "ready") updatePick();          // back on the select screen: show LOCKED IN / RESULT SEEN as stored
    S.listeners.forEach((fn) => fn(st));
  }

  function refresh() {
    const st = S.state, on = S.power;
    const led = (k, v, blink) => { const el = $(`[data-led="${k}"]`); if (el) { el.classList.toggle("on", !!v); el.classList.toggle("blink", !!blink); } };
    led("power", on);
    led("play", on && st === "replay");
    led("stop", on && st === "paused");
    led("still", on && st === "still");
    led("slow", on && S.slow);
    led("result", on && st === "result");
    led("tape", on && hasVideo());
    const latch = (k, v) => { const el = $(`[data-key="${k}"]`); if (el) el.classList.toggle("is-latched", !!v); };
    latch("play", on && st === "replay");
    latch("stop", on && st === "paused");
    latch("still", on && st === "still");
    latch("slow", on && S.slow);
    latch("result", on && st === "result");
    latch("archive", on && st === "archive");
    // data-driven availability (hardware keys still click; they are disabled only when the tape lacks the data)
    const noVid = !hasVideo(), noEv = !S.day || !S.day.events.length;
    for (const k of ["rew", "ff", "still", "slow"]) $(`[data-key="${k}"]`).disabled = on && noVid;
    // ◀ ▶ also pick a champion (READY), turn result pages and switch archive tabs, so they stay live there on every tape
    for (const k of ["prev", "next"]) $(`[data-key="${k}"]`).disabled = on && !["ready", "result", "archive"].includes(st) && (noVid || noEv);
    $$(".lcd-icons i").forEach((i) => i.classList.remove("on"));
    if (on) {
      const icon = (k) => $(`.lcd-icons [data-ic="${k}"]`).classList.add("on");
      if (st === "replay") icon("play");
      if (st === "paused") icon("stop");
      if (st === "still") icon("still");
      if (S.slow) icon("slow");
      if (hasVideo()) icon("tape");
    }
    soundIndicators();
    updateLCD(true);
  }

  /* tiny hardware sound indicators: never claim sound before the browser has unlocked audio */
  function soundIndicators() {
    const led = $("#snd-led"), note = $("#snd-note"), lcd = $('.lcd-icons [data-ic="snd"]'), vol = $("#vol");
    const unlocked = AUDIO.unlocked(), audible = AUDIO.audible && AUDIO.audible();
    led.classList.toggle("on", S.power && !!audible);
    led.classList.toggle("blink", S.power && !unlocked);
    if (lcd) lcd.classList.toggle("on", S.power && !!audible);
    note.textContent = !unlocked ? "SOUND STARTS ON FIRST PRESS" : AUDIO.muted && AUDIO.muted() ? "MUTED · CLICK LABEL" : `VOLUME ${AUDIO.volume ? AUDIO.volume() : ""}`;
    if (AUDIO.volume && document.activeElement !== vol) vol.value = AUDIO.muted() ? 0 : AUDIO.volume();
  }

  function updateLCD(force) {
    const clockEl = $("#lcd-clock"), sub = $("#lcd-sub");
    if (!S.power) { clockEl.textContent = "--:--:--"; sub.innerHTML = "&nbsp;"; return; }
    const d = S.day, st = S.state;
    const clock = hasVideo() && (REPLAY_STATES.has(st) || st === "ready") ? nowClock() : (d && d.window ? d.window.t0 : 0);
    clockEl.textContent = st === "boot" ? "--:--:--" : formatRelTime(clock);
    const ev = currentEventIndex(clock), n = d && d.events ? d.events.length : 0;
    const evTxt = n ? `EVT ${ev + 1}/${n} ${ev >= 0 ? evInfo(d.events[ev]).short : "START"}` : "NO EVENT LOG";
    const txt = {
      boot: "SELF CHECK",
      ready: `${pred().pick ? "PICK " + pred().pick.toUpperCase() : "PICK CHAMPION"} · TAPE ${d ? d.short : "--"}`,
      replay: `▶ ${S.slow ? "2×" : "4×"} · ${evTxt}`,
      paused: `■ STOP · ${evTxt}`,
      still: `STILL · ${evTxt}`,
      archive: S.arTab === 2 ? (S.fighterSub ? (S.fighterSub === 1 ? "DAN WEIGHT HISTORY" : "SANBO WEIGHT HISTORY") : "FIGHTER PROFILE") : S.arTab ? "PLAYER RECORD · 30 DAYS" : `EJECT · TAPE ${S.arSel + 1}/${DATA.days.length}`,
      result: `RESULT ${S.resPage + 1}/${RESULT_PAGES} · ${["OUTCOME", "MEMORIES", "STATS", "REACTION"][S.resPage]}`,
      postmatch: "MATCH COMPLETE",
      nosignal: d && d.replay && d.replay.status === "withheld" ? "NO SIGNAL · WITHHELD" : "NO SIGNAL · NO VIDEO",
    }[st] || st.toUpperCase();
    if (machine.classList.contains("printing")) sub.textContent = "VIDEO PRINT …";
    else if (force || sub.textContent !== txt) sub.textContent = txt;
  }

  function currentEventIndex(clock) {
    const evs = S.day.events;
    // an explicit PREV/NEXT selection wins while the playhead is still on that event
    if (S.evCursor != null && evs[S.evCursor] && Math.abs(evs[S.evCursor].t - clock) < 1) return S.evCursor;
    let idx = -1;
    evs.forEach((e, i) => { if (e.t <= clock + 0.01) idx = i; });
    return idx;
  }

  function osd(text, ms = 1300, cls = "") {
    osdEl.textContent = text;
    osdEl.className = `osd show ${cls}`;
    clearTimeout(S.osdTimer);
    if (ms) S.osdTimer = setTimeout(() => osdEl.classList.remove("show"), ms);
  }

  /* announce a canonical report event: banner + its sound cue (same call, so they never disagree) */
  function toast(e) {
    AUDIO.event(e, { soft: S.state !== "replay" });
    const i = evInfo(e);
    toastEl.className = `toast show t-${i.tone}`;
    toastEl.innerHTML = `<b>${esc(i.big)}</b><span>${esc(e.time)} · ${esc(i.sub)}</span>`;
    clearTimeout(S.toastTimer);
    S.toastTimer = setTimeout(() => toastEl.classList.remove("show"), 1800);
  }

  function glitch() { screen.classList.remove("glitch"); void screen.offsetWidth; screen.classList.add("glitch"); }

  /* ------------------------------------------------------------ renderers */
  /* pre-match chips: only facts known before the bowl is touched (no outcome spoilers) */
  function chipsFor(d) {
    const fd = d.events.find((e) => e.type === "food_dispensed");
    const out = [
      ["white", "tape", `TAPE ${d.short} · ${d.duration_str || (d.window ? d.window.duration : "") || "04:44"}`],
      ["white", "check", fd ? `KIBBLE DROP ${approx(d.kibble.start)}` : `DAN BOWL ${approx(d.kibble.start)}`],
      d.video ? ["blue", "play", "REPLAY READY"] : ["white", "tape", d.replay && d.replay.status === "withheld" ? "WITHHELD (PRIVACY GUARD)" : "NO VIDEO ON TAPE"],
    ];
    return out.map(([tone, ic, t]) => `<span class="chip tone-${tone}">${ICON[ic]}<span>${esc(t)}</span></span>`).join("");
  }

  /* PICK YOUR CHAMPION: an arcade character-select (two real fighters, a portrait selector, a 1P cursor).
   * Pre-match only: nothing here may reveal the outcome. */
  function renderVS() {
    const d = S.day;
    const dur = d.duration_str || (d.window ? d.window.duration : "") || "04:44";
    const tile = (who, n, name) => `<button class="ptile ${who}" data-pick="${who}" tabindex="-1" aria-label="Pick ${name}">
        <i class="cursor">1P</i><img class="face" src="assets/sprite-${who}.png" alt=""><span class="pn">P${n} ${name}</span><span class="lockstamp">LOCKED</span></button>`;
    $("#s-vs").innerHTML = `
      <div class="vs-burst"></div><div class="vs-seam"></div>
      <img class="vs-cat dan v2" src="assets/vs-dan-v2.png" alt="Dan">
      <img class="vs-cat sanbo" src="assets/vs-sanbo.png" alt="Sanbo">
      <div class="pick-head"><b>PICK YOUR CHAMPION</b><span class="q">CAN DAN DEFEND HIS BREAKFAST?</span><span class="meta">BREAKFAST MATCH · ${esc(d.label)} · ${esc(dur)}</span></div>
      <div class="bowl"><span class="bowl-vs">VS</span><img src="assets/bowl-kibble.png" alt="Dan's bowl of dry cat food"><span class="bowl-tag">DAN'S BOWL · DEFEND OR RAID?</span></div>
      <div class="fname l"><span class="tag">P1 · DAN</span><b>DAN</b><em>DEFEND YOUR BREAKFAST</em></div>
      <div class="fname r"><span class="tag">P2 · SANBO</span><b>SANBO</b><em>RAID DAN'S BOWL</em></div>
      <div class="csel">
        <div class="csel-row">
          <button class="carr l" data-pick="dan" tabindex="-1" aria-label="Select Dan">◀</button>
          ${tile("dan", 1, "DAN")}${tile("sanbo", 2, "SANBO")}
          <button class="carr r" data-pick="sanbo" tabindex="-1" aria-label="Select Sanbo">▶</button>
        </div>
        <div class="csel-state" id="pick-state">—</div>
        <div class="csel-help" id="pick-help">◀ ▶ SELECT</div>
        <div class="csel-press" id="pick-press">A / PLAY TO LOCK IN</div>
      </div>
      <div class="vs-chips">${chipsFor(d)}</div>`;
    updatePick();
  }
  function updatePick(snap) {
    const pr = pred(), el = $("#s-vs"); if (!el.firstElementChild) return;
    const pick = pr.pick, nm = (w) => (w === "dan" ? "P1 · DAN" : "P2 · SANBO");
    el.classList.toggle("pick-dan", pick === "dan"); el.classList.toggle("pick-sanbo", pick === "sanbo");
    el.classList.toggle("no-pick", !pick);
    el.classList.toggle("locked", pr.locked);
    if (snap && pick) {                        // frame-stepped snap on the newly selected tile
      const t = el.querySelector(`.ptile.${pick}`); t.classList.remove("snap"); void t.offsetWidth; t.classList.add("snap");
      const ar = el.querySelector(pick === "dan" ? ".carr.l" : ".carr.r"); ar.classList.remove("hit"); void ar.offsetWidth; ar.classList.add("hit");
    }
    const nb = (w) => (w ? w.toUpperCase() : "NO BET");
    $("#pick-state").textContent = pr.revealed ? `RESULT SEEN · YOUR PICK · ${nb(pick)}`
      : pr.locked ? `PREDICTION LOCKED · ${nb(pick)}` : pick ? `CURRENT PICK · ${pick.toUpperCase()}` : "NO PICK YET";
    $("#pick-help").textContent = pr.locked ? "LOCKED WHEN THE MATCH STARTED" : "CHANGE ANYTIME BEFORE PLAY";
    $("#pick-press").textContent = FILE_MODE ? "OPEN VIA LOCAL SERVER" : !S.day.video ? "NO VIDEO · PRESS RESULT"
      : pr.revealed ? "A / PLAY TO REWATCH · RESULT KEY" : pr.locked ? "A / PLAY TO CONTINUE" : "A / PLAY STARTS THE MATCH";
  }
  function choose(who) {
    const pr = pred();
    if (pr.locked) { AUDIO.ui("tick"); osd("PICK LOCKED", 900); return; }
    pr.pick = who; savePred(pr);
    AUDIO.ui("nav", who === "dan");
    updatePick(true); updateLCD(true);
  }

  function renderReplayStatic() {
    const d = S.day;
    const pct = (t) => `${(tlFrac(t) * 100).toFixed(2)}%`;
    const L = d.video ? d.video.layout : null;
    // inset the track exactly like the burned-in track above it (x 20→700 of 720), so both bars line up
    $("#course").style.setProperty("--inset-l", L ? `${(L.track_x0 / 720) * 100}%` : "0%");
    $("#course").style.setProperty("--inset-r", L ? `${((720 - L.track_x1) / 720) * 100}%` : "0%");
    const gaps = d.sessions.flatMap((s) => s.gaps).map((g) => `<i class="gap" style="left:${pct(g.t0)};width:calc(${pct(g.t1)} - ${pct(g.t0)} + 2px)"></i>`).join("");
    const pips = d.events.map((e, i) => `<button class="pip" data-ev="${i}" style="left:${pct(e.t)};background:${pipColor(e)}" title="${esc(e.time + " " + evInfo(e).short)}" aria-label="Jump to ${esc(e.time + " " + evInfo(e).short)}"></button>`).join("");
    const win = `<i class="win" style="left:${pct(d.window.t0)};width:calc(${pct(d.window.t1)} - ${pct(d.window.t0)})" title="report window ${esc(d.window.start)}–${esc(d.window.end)}"></i>`;
    $("#course").innerHTML = `<div class="ctrack"><i class="trk"></i>${win}<i class="done" id="c-done"></i>${gaps}${pips}<i class="head" id="c-head"></i></div>`;
    $("#pl-l1").innerHTML = `<div class="posnum" style="color:var(--p1)">P1</div><div class="pl-name" style="color:var(--p1)">DAN</div><div class="hud">HOME LANE</div><div class="hud dim">DAN FEEDER<br>TAPO · IR</div>`;
    $("#pl-l2").innerHTML = `<div class="posnum" style="color:var(--p2)">P2</div><div class="pl-name" style="color:var(--p2)">SANBO</div><div class="hud">HOME LANE</div><div class="hud dim">SANBO FEEDER<br>LOGITECH · USB</div>`;
    $("#hud1").innerHTML = `<span class="lanetag" style="color:var(--p1)">P1 · DAN <small>DAN FEEDER · TAPO</small></span><span class="lanekib" id="kib1"></span><span id="rb1"></span>`;
    $("#hud2").innerHTML = `<span class="lanetag" style="color:var(--p2)">P2 · SANBO <small>SANBO FEEDER · LOGITECH</small></span><span class="lanekib" id="kib2"></span><span id="rb2"></span>`;
    $("#cv-bar").height = L ? L.bar_h : 42;
    $(".telemetry").style.aspectRatio = L ? `720/${L.bar_h}` : "720/42";
    for (const c of Object.values(ctx)) { c.fillStyle = "#000"; c.fillRect(0, 0, c.canvas.width, c.canvas.height); }
  }

  function updateHud() {
    if (!S.day) return;
    const d = S.day, clock = nowClock(), sec = Math.floor(clock);
    const key = `${S.state}|${sec}|${S.slow}`;
    // playhead moves every frame; text only when the second changes
    if (REPLAYISH.has(S.state)) {
      const p = tlFrac(clock) * 100;
      const done = $("#c-done"), head = $("#c-head");
      if (done) done.style.width = `${p}%`;
      if (head) head.style.left = `${p}%`;
    }
    if (key === S.hudKey) return;
    S.hudKey = key;
    updateLCD();
    if (!REPLAY_STATES.has(S.state)) return;
    const evIdx = currentEventIndex(clock);
    const lastIn = (lane) => { for (let i = evIdx; i >= 0; i--) if (evInfo(d.events[i]).lane === lane) return d.events[i]; return null; };
    const sess = (d.sessions || []).findIndex((s) => clock >= s.t0 && clock <= s.t1);
    const gap = (d.sessions || []).flatMap((s) => s.gaps || []).find((g) => clock >= g.t0 && clock <= g.t1);
    const e1 = lastIn(1), e2 = lastIn(2);
    const evLine = (e) => (e ? `<div class="hud dim">LAST EVENT</div><div class="pl-ev">${e.time}<br>${esc(evInfo(e).short)}</div>` : `<div class="hud dim">LAST EVENT</div><div class="pl-ev">—</div>`);
    $("#pl-r1").innerHTML = `<div class="hud dim">MATCH TIME</div><div class="big-clock">${formatRelTime(clock)}</div>${evLine(e1)}<div class="hud dim">DAN BOWL ${approx(d.kibble.start)} → ${d.kibble.end ?? "?"}</div>`;
    const s2 = sess >= 0 ? d.sessions[sess] : null;
    const s2txt = gap ? `<div class="pl-ev" style="color:var(--amber)">SOURCE GAP<br>${gap.start}–${gap.end}</div>`
      : s2 ? `<div class="pl-ev">SESSION ${sess + 1}/${d.sessions.length}<br>EATING: ${esc((s2.eating || "?").toUpperCase())}</div>`
      : `<div class="pl-ev">${d.sessions && d.sessions.length ? "NO SESSION NOW" : "NO SESSION DATA"}</div>`;
    $("#pl-r2").innerHTML = `<div class="hud dim">MATCH TIME</div><div class="big-clock">${formatRelTime(clock)}</div>${s2txt}${evLine(e2)}`;
    $("#kib1").textContent = formatRelTime(clock);
    $("#kib2").textContent = gap ? "SOURCE GAP" : s2 ? `S${sess + 1}/${d.sessions.length} EATING ${String(s2.eating || "?").toUpperCase()}` : "NO SESSION";
    const rib = (e, el) => {
      const box = $(el);
      if (!e || clock - e.t > 25) { box.innerHTML = ""; return; }
      const i = evInfo(e);
      const html = `<span class="ribbon rb-${i.tone}">${i.tone === "red" ? ICON.warn : ""}${esc(i.short)}</span>`;
      if (box.dataset.ev !== e.time + e.type) { box.innerHTML = html; box.dataset.ev = e.time + e.type; }
    };
    rib(e1, "#rb1"); rib(e2, "#rb2");
  }

  /* ARCHIVE has four tabs (◀ ▶): MATCH TAPES, PLAYER RECORD, FIGHTERS, and MEME CARDS.
   * Spoiler rule: a tape's outcome, steward status and deck slot appear only after its RESULT was seen. */
  const AR_TABS = ["MATCH TAPES", "PLAYER RECORD", "FIGHTERS", "MEME CARDS"];
  const dm = (d) => `${d.date.slice(8)} ${d.label.split(" ")[2]}`;
  const STEWARD = { "CLEAN MATCH": "CLEAN", "STEWARDS REVIEW": "REVIEW" };

  const MEME_CARDS = [
    // P1 DAN CARDS
    {
      id: "dan-sunglasses",
      cat: "dan",
      player: "P1",
      name: "SUNGLASSES",
      title: "BREAKFAST DEFENDED",
      file: "assets/memes/dan-sunglasses.jpg",
      hint: "WITNESS DAN DEFEND & CLEAR HIS BOWL (DAN WIN)",
      story: "Dan cleared his bowl with zero Sanbo intake",
    },
    {
      id: "dan-yamcha-defeat",
      cat: "dan",
      player: "P1",
      name: "YAMCHA DEFEAT",
      title: "DAN LOST HIS BREAKFAST",
      file: "assets/memes/dan-yamcha-defeat.jpg",
      hint: "BACK DAN IN A MATCH WHERE SANBO RAIDS HIS BOWL",
      story: "Sanbo raided Dan's feeder after you backed Dan",
    },
    {
      id: "dan-huh",
      cat: "dan",
      player: "P1",
      name: "HUH CAT",
      title: "UNRESOLVED MYSTERY",
      file: "assets/memes/dan-huh.jpg",
      hint: "INSPECT THE RESULT OF AN UNRESOLVED 'NO CONTEST' TAPE",
      story: "Unresolved match outcome without conclusive event log",
    },
    {
      id: "dan-take-some",
      cat: "dan",
      player: "P1",
      name: "CHOPSTICKS RAID",
      title: "DAN COUNTER-RAID",
      file: "assets/memes/dan-take-some.jpg",
      hint: "VIEW A MATCH WHERE DAN RAIDS SANBO'S FEEDER (BONUS EVENT)",
      story: "Dan entered Sanbo's feeding lane in a bonus raid",
    },

    // P2 SANBO CARDS
    {
      id: "sanbo-take-some",
      cat: "sanbo",
      player: "P2",
      name: "RAID CHOPSTICKS",
      title: "RAID SUCCESS!",
      file: "assets/memes/sanbo-take-some.jpg",
      hint: "WITNESS SANBO ENTER DAN'S BOWL (SANBO WIN)",
      story: "Sanbo entered Dan's bowl: house rule raid victory",
    },
    {
      id: "sanbo-crying",
      cat: "sanbo",
      player: "P2",
      name: "CRYING CAT",
      title: "NOT TODAY, SANBO",
      file: "assets/memes/sanbo-crying.jpg",
      hint: "BACK SANBO IN A MATCH WHERE DAN DEFENDS HIS BOWL",
      story: "Dan defended his feeder after you backed Sanbo",
    },
    {
      id: "sanbo-sunglasses",
      cat: "sanbo",
      player: "P2",
      name: "SUNGLASSES",
      title: "YOU CALLED THE RAID",
      file: "assets/memes/sanbo-sunglasses.jpg",
      hint: "BACK SANBO IN A MATCH WHERE SANBO SUCCESSFULLY RAIDS",
      story: "Sanbo successfully raided Dan's bowl and you called it",
    },
    {
      id: "sanbo-huh",
      cat: "sanbo",
      player: "P2",
      name: "PUZZLED RAIDER",
      title: "UNRESOLVED RAID",
      file: "assets/memes/sanbo-huh.jpg",
      hint: "INSPECT AN UNRESOLVED 'NO CONTEST' TAPE (SPECIAL DOUBLE UNLOCK)",
      story: "Puzzled raider in an unresolved match state",
    },
  ];

  const MEMES_KEY = "kr94.memes.unlocked";
  function getUnlockedMemes() {
    try {
      const raw = localStorage.getItem(MEMES_KEY);
      if (raw) return new Set(JSON.parse(raw));
    } catch (e) { /* fallback if localStorage blocked */ }
    return S.unlockedMemes || new Set();
  }
  function saveUnlockedMeme(assetId) {
    if (!assetId) return false;
    const set = getUnlockedMemes();
    if (set.has(assetId)) return false;
    set.add(assetId);
    S.unlockedMemes = set;
    try {
      localStorage.setItem(MEMES_KEY, JSON.stringify([...set]));
    } catch (e) { /* in-memory fallback */ }
    return true;
  }

  // Featured Replay Deck status in archive list
  function vaultSlot(d) {
    const deck = DATA.featured_deck || DATA.showcase;
    if (deck && deck.latest && deck.latest.includes(d.date)) return { id: "vault", text: "IN DECK · LATEST" };
    if (deck && deck.classics && deck.classics.includes(d.date)) return { id: "vault", text: "IN DECK · CLASSIC" };
    if (d.video && (!d.replay || d.replay.status !== "withheld")) return { id: "aged", text: "ARCHIVE REPLAY" };
    if (d.replay && d.replay.status === "withheld") return { id: "none", text: "WITHHELD" };
    return { id: "none", text: "DATA ONLY" };
  }
  function recordToday() {
    const q = new URLSearchParams(location.search).get("today");   // review/test override only
    const t = q && /^\d{4}-\d{2}-\d{2}$/.test(q) ? new Date(q + "T12:00:00") : new Date();
    return new Date(t.getFullYear(), t.getMonth(), t.getDate());
  }
  function playerRecord() {
    const today = recordToday(), from = new Date(today); from.setDate(from.getDate() - 29);   // 30 days incl. today
    const iso = (x) => `${x.getFullYear()}-${String(x.getMonth() + 1).padStart(2, "0")}-${String(x.getDate()).padStart(2, "0")}`;
    const lo = iso(from), hi = iso(today);
    const days = DATA.days.filter((d) => d.date >= lo && d.date <= hi).sort((a, b) => (a.date < b.date ? 1 : -1));
    const tally = { W: 0, L: 0, VOID: 0, NOBET: 0, PENDING: 0, dan: 0, sanbo: 0, nc: 0, hidden: 0 };
    const rows = days.map((d) => {
      const pr = pred(d.date), g = gameOutcome(d);
      if (!pr.revealed) { tally.hidden++; if (pr.pick) tally.PENDING++;
        return { d, game: "UNPLAYED", gtone: "white", pick: pr.pick, bet: pr.pick ? "PENDING" : "—", btone: "white", stew: "—" }; }
      g.winner === "dan" ? tally.dan++ : g.winner === "sanbo" ? tally.sanbo++ : tally.nc++;
      const v = betVerdict(g, pr.pick);
      let bet, btone;
      if (!pr.pick) { tally.NOBET++; bet = "NO BET"; btone = "white"; }
      else if (v.id === "void") { tally.VOID++; bet = "VOID"; btone = "white"; }
      else if (v.id === "win") { tally.W++; bet = "✓ CALLED IT"; btone = "green"; }
      else { tally.L++; bet = "✕ LOST"; btone = "red"; }
      const sr = stewardResult(d);
      return { d, game: g.label, gtone: g.winner ? (g.winner === "dan" ? "p1" : "p2") : "white", pick: pr.pick, bet, btone, stew: STEWARD[sr.label] || sr.label };
    });
    // hit rate: resolved outcome AND a placed pick only (VOID / NO CONTEST and NO BET are excluded)
    const graded = tally.W + tally.L;
    return { lo, hi, rows, tally, hit: graded ? Math.round((tally.W / graded) * 100) : null, graded };
  }
  function renderArchive() {
    const tabs = AR_TABS.map((t, i) => `<span class="ar-tab${i === S.arTab ? " on" : ""}">${t}</span>`).join("");
    const head = `<div class="ar-head"><b>${["SELECT MATCH", "PLAYER RECORD", "FIGHTER PROFILE", "MEME CARD COLLECTION"][S.arTab]}</b><div class="ar-tabs"><i>◀</i>${tabs}<i>▶</i></div></div>`;
    if (S.arTab === 1) { $("#s-archive").innerHTML = head + renderRecord(); return; }
    if (S.arTab === 2) { $("#s-archive").innerHTML = head + renderFighters(); return; }
    if (S.arTab === 3) { $("#s-archive").innerHTML = head + renderMemeCards(); return; }
    const rows = DATA.days.map((d, i) => {
      const isWithheld = d.replay && d.replay.status === "withheld";
      const media = isWithheld ? "WITHHELD" : d.video ? `VIDEO${d.stills && d.stills.length ? ` · ${d.stills.length} STILLS` : ""}` : "NO VIDEO";
      const seen = pred(d.date).revealed, vs = seen ? vaultSlot(d) : null;
      return `<button class="ar-row${i === S.arSel ? " sel" : ""}" data-ar="${i}">
        <span class="cur">►</span>
        <span class="dt">${dm(d)}<small>${esc(d.dow)}${d.date === DATA.latest ? " · LATEST" : ""}</small></span>
        ${seen
          ? `<span class="sc"><i>DAN ${approx(d.dan ? d.dan.kibble : null)}</i> · <u>SANBO ${approx(d.sanbo ? d.sanbo.kibble : null)}</u></span><span class="tg tone-${gameOutcome(d).winner ? "green" : "white"}">${esc(gameOutcome(d).label)}</span>`
          : `<span class="sc">${pred(d.date).pick ? "PICK " + pred(d.date).pick.toUpperCase() : "NO PICK YET"}</span><span class="tg tone-white">UNPLAYED</span>`}
        <span class="md">${media}${vs ? `<em class="vault-${vs.id}">${esc(vs.text)}</em>` : ""}</span></button>`;
    }).join("");
    $("#s-archive").innerHTML = `${head}
      <div class="ar-list">${rows}</div>
      <div class="ar-vault"><b>FEATURED REPLAY DECK</b><span>CURATES 3 LATEST PLAYABLE REPLAYS + UP TO 4 BALANCED CLASSICS · FULL MATCH RECORDS IN ARCHIVE</span></div>
      <div class="ar-foot"><span>↑↓ SELECT · ▶ PLAY / ENTER LOAD · ◀ ▶ TAB</span><span>■ STOP / ESC BACK</span></div>`;
  }
  function renderRecord() {
    const R = playerRecord(), T = R.tally;
    const who = (w) => (w === "dan" ? "PICK DAN" : w === "sanbo" ? "PICK SANBO" : "NO PICK");
    const rows = R.rows.map((r) => `<div class="rec-row"><span class="rd">${dm(r.d)}</span><span class="tone-${r.gtone}">${esc(r.game)}</span>
      <span>${who(r.pick)}</span><span class="tone-${r.btone}">${esc(r.bet)}</span><span class="rs">${esc(r.stew)}</span></div>`).join("")
      || `<div class="rec-empty">NO MATCHES IN THE LAST 30 DAYS</div>`;
    return `<div class="rec-sub">MATCH RECORD · LAST 30 DAYS · ${esc(R.lo.slice(5).replace("-", "/"))}–${esc(R.hi.slice(5).replace("-", "/"))} · METADATA ONLY · NO VIDEO KEPT · PICKS STORED IN THIS BROWSER</div>
      <div class="rec-wrap">
        <div class="rec-list"><div class="rec-row rec-h"><span>DATE</span><span>GAME RESULT</span><span>YOUR PICK</span><span>BET</span><span class="rs">STEWARDS</span></div>${rows}</div>
        <div class="rec-side">
          <div class="rec-box"><b>YOUR RECORD</b>
            <div class="rec-score"><span class="tone-green">${T.W}<small>W</small></span><span class="tone-red">${T.L}<small>L</small></span><span>${T.VOID}<small>VOID</small></span></div>
            <div class="rec-hit">HIT RATE <em>${R.hit == null ? "—" : R.hit + "%"}</em></div>
            <div class="rec-note">${R.graded} GRADED · VOID + NO BET EXCLUDED${T.NOBET ? ` · ${T.NOBET} NO BET` : ""}${T.PENDING ? ` · ${T.PENDING} PENDING` : ""}</div></div>
          <div class="rec-box"><b>CAT RECORD</b>
            <div class="rec-cat"><span class="tone-p1">DAN</span><em>${T.dan} W</em></div>
            <div class="rec-cat"><span class="tone-p2">SANBO</span><em>${T.sanbo} W</em></div>
            <div class="rec-cat"><span>NC</span><em>${T.nc}</em></div>
            <div class="rec-note">${T.hidden ? `${T.hidden} UNPLAYED · HIDDEN UNTIL RESULT` : "ALL MATCHES REVEALED"}</div></div>
        </div>
      </div>
      <div class="ar-foot"><span>◀ ▶ TAB · ↑↓ SCROLL</span><span>■ STOP / ESC BACK</span></div>`;
  }
  /* Generates retro game ASCII coordinate chart */
  function buildAsciiChart(history) {
    if (!history || !history.length) return "NO WEIGHT RECORDS AVAILABLE";
    const weights = history.map((r) => r.weight_kg);
    const minW = Math.floor(Math.min(...weights) * 10) / 10;
    const maxW = Math.ceil(Math.max(...weights) * 10) / 10;
    const levels = [];
    for (let w = maxW; w >= minW - 0.01; w -= 0.1) levels.push(+w.toFixed(1));

    // Group records by month (e.g. "APR", "MAY")
    const monthNames = ["JAN", "FEB", "MAR", "APR", "MAY", "JUN", "JUL", "AUG", "SEP", "OCT", "NOV", "DEC"];
    const monthCols = [];
    const recordCols = [];
    history.forEach((r) => {
      const mIdx = parseInt(r.date.split("-")[1], 10) - 1;
      const mLabel = monthNames[mIdx];
      let colIdx = monthCols.indexOf(mLabel);
      if (colIdx === -1) {
        monthCols.push(mLabel);
        colIdx = monthCols.length - 1;
      }
      recordCols.push({ col: colIdx, weight: r.weight_kg, date: r.date });
    });

    const colWidth = 6;
    const totalCols = monthCols.length;
    const lines = [];

    levels.forEach((lvl) => {
      let row = `${lvl.toFixed(1)} ┤`;
      for (let c = 0; c < totalCols; c++) {
        const matches = recordCols.filter((r) => r.col === c && Math.abs(r.weight - lvl) < 0.05);
        if (matches.length === 1) {
          row += "   ●  ";
        } else if (matches.length > 1) {
          row += "  ● ● "; // Both points plotted distinctly without averaging
        } else {
          row += "      ";
        }
      }
      lines.push(row);
    });

    // Bottom axis line
    lines.push(`    └${"─".repeat(totalCols * colWidth + 2)}`);
    // Month label row
    let monthRow = "     ";
    monthCols.forEach((m) => {
      monthRow += ` ${m.padEnd(colWidth - 1, " ")}`;
    });
    lines.push(monthRow);

    return lines.join("\n");
  }

  function renderWeightChart(catKey, catData) {
    const isDan = catKey === "dan";
    const name = isDan ? "DAN" : "SANBO";
    const pNum = isDan ? "P1" : "P2";
    const hist = (catData.weight_history || []).slice().sort((a, b) => a.date.localeCompare(b.date));
    const ascii = buildAsciiChart(hist);
    const curr = catData.current_weight_kg ? catData.current_weight_kg.toFixed(2) : "?";
    const logItems = hist.slice().reverse().map((r) => {
      const parts = r.date.split("-");
      const dStr = `${parts[2]} ${["JAN","FEB","MAR","APR","MAY","JUN","JUL","AUG","SEP","OCT","NOV","DEC"][parseInt(parts[1],10)-1]}`;
      return `<span>${dStr} · ${r.weight_kg.toFixed(2)} kg</span>`;
    }).join("");

    return `
      <div class="wh-box ${isDan ? "p1" : "p2"}">
        <div class="ar-head" style="margin-bottom:0">
          <b>${name} · WEIGHT HISTORY</b>
          <button class="fp-btn" data-fsub="0" style="padding:.4cqh .8cqw">◀ BACK TO FIGHTERS</button>
        </div>
        <div class="wh-chart-ascii">${ascii}</div>
        <div class="wh-current">CURRENT · ${curr} KG <span>(WEIGHED ${catData.weighed_date || "?"})</span></div>
        <div class="wh-meta">ALL CHRONOLOGICAL LOG ENTRIES (NO SILENT AVERAGING · EXACT CARE STORE VALUES):</div>
        <div class="wh-log">${logItems}</div>
      </div>
      <div class="ar-foot"><span>CLICK BACK TO RETURN</span><span>■ STOP / ESC BACK</span></div>`;
  }

  /* FIGHTER PROFILE: read-only care profiles & authoritative weight history */
  function renderFighters() {
    const F = DATA.fighters || {};
    const dan = F.dan || {};
    const sanbo = F.sanbo || {};

    if (S.fighterSub === 1) return renderWeightChart("dan", dan);
    if (S.fighterSub === 2) return renderWeightChart("sanbo", sanbo);

    const card = (cat, n, c, name, role) => `
      <div class="fp p${n}">
        <div class="fp-hd">
          <img src="assets/sprite-${cat}.png" alt="">
          <div>
            <span class="tag">P${n} · ${role}</span>
            <b>${name}</b>
            <em>${c.age_years || "?"} YEAR${c.age_years === 1 ? "" : "S"} OLD · ${esc(c.sex)} · ${esc(c.coat)}</em>
          </div>
        </div>
        <div class="fp-main-stat">
          <span class="fp-stat-label">WEIGHT</span>
          <b class="fp-stat-val">${c.current_weight_kg ? c.current_weight_kg.toFixed(2) : "?"} KG</b>
        </div>
        <button class="fp-btn" data-fsub="${n}">▶ VIEW WEIGHT HISTORY</button>
      </div>`;

    return `
      <div class="fp-wrap">
        ${card("dan", 1, dan, "DAN", "DEFENDER")}
        ${card("sanbo", 2, sanbo, "SANBO", "RAIDER")}
      </div>
      <div class="fp-src">HOUSEHOLD CARE PROFILES &amp; AUTHORITATIVE WEIGHT LEDGER · CLICK OR PRESS 1/2 FOR WEIGHT HISTORY</div>
      <div class="ar-foot"><span>◀ ▶ TAB · 1/2 SELECT FIGHTER</span><span>■ STOP / ESC BACK</span></div>`;
  }

  /* MEME CARD COLLECTION: retro 1994 CRT gallery tracking unlocked Dan and Sanbo reactions.
   * Locked cards provide authentic arcade hints; unlocks happen exclusively through match result viewing. */
  function renderMemeCards() {
    const unlocked = getUnlockedMemes();
    const danCards = MEME_CARDS.filter((c) => c.cat === "dan");
    const sanboCards = MEME_CARDS.filter((c) => c.cat === "sanbo");
    const danUnlocked = danCards.filter((c) => unlocked.has(c.id)).length;
    const sanboUnlocked = sanboCards.filter((c) => unlocked.has(c.id)).length;
    const totalUnlocked = danUnlocked + sanboUnlocked;
    const totalCards = MEME_CARDS.length;
    const pct = Math.round((totalUnlocked / totalCards) * 100);

    const filledBlocks = Math.round((totalUnlocked / totalCards) * 16);
    const meter = "█".repeat(filledBlocks) + "░".repeat(16 - filledBlocks);

    const renderCard = (c) => {
      const isUnlocked = unlocked.has(c.id);
      if (isUnlocked) {
        return `
          <div class="mc-card unlocked ${c.cat}">
            <div class="mc-img">
              <img src="${esc(c.file)}" alt="${esc(c.name)}">
              <span class="synth">SYNTHETIC · NOT EVIDENCE</span>
            </div>
            <div class="mc-body">
              <div class="mc-tag">${esc(c.player)} · ${esc(c.name)}</div>
              <b>${esc(c.title)}</b>
              <p>${esc(c.story)}</p>
              <span class="mc-status ok">✓ UNLOCKED</span>
            </div>
          </div>`;
      } else {
        return `
          <div class="mc-card locked ${c.cat}">
            <div class="mc-img locked">
              <div class="mc-lock-box">
                <span class="mc-q">[ ? ]</span>
                <small>LOCKED</small>
              </div>
            </div>
            <div class="mc-body">
              <div class="mc-tag">${esc(c.player)} · SECRET CARD</div>
              <b>${esc(c.name)}</b>
              <p class="mc-hint">HINT: ${esc(c.hint)}</p>
              <span class="mc-status lock">🔒 LOCKED</span>
            </div>
          </div>`;
      }
    };

    return `
      <div class="mc-sub">
        <span>COLLECTION PROGRESS · ${totalUnlocked}/${totalCards} CARDS UNLOCKED (${pct}%)</span>
        <span class="mc-meter">[${meter}]</span>
        <span>DAN: ${danUnlocked}/${danCards.length} · SANBO: ${sanboUnlocked}/${sanboCards.length}</span>
      </div>
      <div class="mc-wrap">
        <div class="mc-col p1">
          <div class="mc-col-hd"><b>P1 DAN CARDS</b><span>${danUnlocked}/${danCards.length} UNLOCKED</span></div>
          <div class="mc-grid">${danCards.map(renderCard).join("")}</div>
        </div>
        <div class="mc-col p2">
          <div class="mc-col-hd"><b>P2 SANBO CARDS</b><span>${sanboUnlocked}/${sanboCards.length} UNLOCKED</span></div>
          <div class="mc-grid">${sanboCards.map(renderCard).join("")}</div>
        </div>
      </div>
      <div class="ar-foot"><span>◀ ▶ TAB · ↑↓ SCROLL</span><span>■ STOP / ESC BACK · SYNTHETIC MEDIA NEVER EVIDENCE</span></div>`;
  }

  function setArchiveTab(dir) {
    S.arTab = (S.arTab + dir + AR_TABS.length) % AR_TABS.length;
    S.fighterSub = 0;
    AUDIO.ui("nav", dir < 0);
    renderArchive(); updateLCD(true);
  }

  /* Filters matches displayed on the physical shelf to the Featured Replay Deck */
  function getFeaturedDeckDays() {
    const deck = DATA.featured_deck || DATA.showcase;
    if (deck && deck.all && deck.all.length) {
      return DATA.days
        .map((d, i) => ({ d, originalIndex: i }))
        .filter(({ d }) => deck.all.includes(d.date));
    }
    return DATA.days.map((d, i) => ({ d, originalIndex: i }));
  }

  function renderShelf() {
    const deck = DATA.featured_deck || DATA.showcase || {};
    const items = getFeaturedDeckDays();
    $("#shelf").innerHTML = items.map(({ d, originalIndex: i }) => {
      const isWithheld = d.replay && d.replay.status === "withheld";
      const dur = d.duration_str || (d.window ? d.window.duration : "");
      const isLatest = deck.latest && deck.latest.includes(d.date);
      const isClassic = deck.classics && deck.classics.includes(d.date);
      const deckBadge = isLatest ? " · LATEST" : (isClassic ? " · CLASSIC" : "");
      return `
      <button class="tape${i === S.dayIdx ? " loaded" : ""}" data-tape="${i}" aria-label="Load match ${esc(d.label)}">
        <span class="lbl"><b>${d.date.slice(8)} ${d.label ? d.label.split(" ")[2] : "SEP"}</b><em>${esc(d.dow)} · ${esc(dur)}${deckBadge}</em>
        ${pred(d.date).revealed
          ? `<span>DAN ${approx(d.dan ? d.dan.kibble : null)} · SANBO ${approx(d.sanbo ? d.sanbo.kibble : null)}</span><i class="tone-${gameOutcome(d).winner ? "green" : "white"}">${esc(gameOutcome(d).label)}${isWithheld ? " · WITHHELD" : d.video ? "" : " · NO VIDEO"}</i>`
          : `<span>${pred(d.date).pick ? "PICK " + pred(d.date).pick.toUpperCase() : "PICK YOUR CHAMPION"}</span><i class="tone-white">${isWithheld ? "WITHHELD" : "UNPLAYED"}${isWithheld ? "" : d.video ? "" : " · NO VIDEO"}</i>`}</span>
        <span class="spool"></span></button>`;
    }).join("");
  }

  function renderStill() {
    const d = S.day, clock = nowClock();
    const withT = d.stills.filter((s) => s.t != null).sort((a, b) => a.t - b.t || a.n - b.n);
    let pick = null;
    for (const s of withT) if (s.t <= clock + 0.5) pick = s;
    if (!pick && withT.length) pick = withT[0];
    const card = $("#still-card");
    if (!pick) {
      card.innerHTML = `<div class="frame"><div class="none">FREEZE FRAME ONLY<br>THIS REPORT HAS NO EVIDENCE STILLS</div></div>
        <div class="cap"><b>STILL · ${hms(clock)}</b><span>LIVE FRAME HELD ON THE LANES BEHIND</span></div>`;
      return;
    }
    card.innerHTML = `<div class="frame"><img src="${esc(pick.src)}" alt="${esc(pick.title)}"></div>
      <div class="cap"><b>EVIDENCE STILL #${pick.n}</b><span>${esc(pick.title.toUpperCase())} · REPORT EVENT ${esc(pick.event_time || "—")}<br>REAL PIPELINE SNAPSHOT · REPLAY HELD AT ${hms(clock)}</span></div>`;
  }

  /* MATCH MEMORIES: up to 4 real pipeline evidence stills, chosen by priority, shown in time order.
   * Nothing is synthesised: no still → no memory. Timing is relative to the kibble drop (T+), not the house clock. */
  const MEMORY = {
    dispensed: { p: 1, cap: (s) => s.title || "KIBBLE DROP" },
    arrival: { p: 2, cap: (s) => s.title || "DAN ARRIVES" },
    foreign_arrival: { p: 3, cap: (s) => s.title || "SANBO RAID", key: true },
    counter_raid: { p: 4, cap: (s) => s.title || "DAN COUNTER RAID", key: true },
    finish: { p: 5, cap: (s) => s.title || "BOWL CLEARED" },
    return_to_feeder: { p: 6, cap: (s) => s.title || "SANBO RETURNS" },
  };
  function memoriesFor(d) {
    if (!d || !d.stills || !d.stills.length) return { from: "KIBBLE DROP", items: [] };
    const span = Math.max(1, d.timeline ? (d.timeline.t1 - d.timeline.t0) : (d.duration_s || 284));
    const items = d.stills.map((s, i) => {
      const relTime = s.event_time || s.rel_time || (s.t != null ? formatRelTime(s.t) : "T+00:00");
      const kindDef = MEMORY[s.kind] || { p: 9, cap: () => s.title || "EVIDENCE STILL" };
      return {
        n: i + 1,
        src: s.src,
        kind: s.kind,
        key: !!kindDef.key,
        rel: relTime,
        cap: s.title || kindDef.cap(s),
        f: Math.min(1, Math.max(0, (s.t != null ? s.t : 0) / span)),
      };
    });
    return { from: "KIBBLE DROP", items };
  }
  function renderMemories(d) {
    const m = memoriesFor(d);
    if (!m.items.length) return `<div class="mem-none"><b>NO EVIDENCE STILLS FOR THIS MATCH</b><span>THE REPORT SAVED NO SNAPSHOTS · NOTHING IS SYNTHESISED</span></div>`;
    const frames = m.items.map((x) => `<figure class="mem${x.key ? " key" : ""}" data-kind="${esc(x.kind)}"><div class="mem-img"><img src="${esc(x.src)}" alt="${esc(x.cap)}"><i class="mem-n">${x.n}</i>${x.key ? `<i class="mem-key">KEY MOMENT</i>` : m.items.length === 3 && x.n === 3 ? `<i class="mem-key fin">PHOTO FINISH</i>` : ""}</div>
      <figcaption><b>${esc(x.rel)}</b> · ${esc(x.cap)}</figcaption></figure>`).join("");
    const groups = [];                     // memories closer than 4 % of the track share one marker ("1·2")
    for (const x of m.items) { const g = groups.at(-1); if (g && x.f - g.f < 0.04) { g.ns.push(x.n); g.key ||= x.key; } else groups.push({ f: x.f, ns: [x.n], key: x.key }); }
    const marks = groups.map((g) => `<i class="mt${g.key ? " key" : ""}" style="left:${(g.f * 100).toFixed(1)}%">${g.ns.join("·")}</i>`).join("");
    return `<div class="mem-grid n${m.items.length}">${frames}</div>
      <div class="mem-track"><span>${esc(m.from)}</span><div class="mtl">${marks}</div><span>END</span></div>`;
  }
  function unlockToast(msg) {
    if (!toastEl) return;
    toastEl.className = "toast show t-white";
    toastEl.innerHTML = `<b>★ MEME CARD UNLOCKED</b><span>${esc(msg)}</span>`;
    clearTimeout(S.toastTimer);
    S.toastTimer = setTimeout(() => toastEl.classList.remove("show"), 2200);
  }

  function unlockMatchMemes(d, outcome, pick) {
    const rx = pickReaction(d, outcome, pick);
    const newly = [];
    if (rx.asset && rx.asset.id) {
      if (saveUnlockedMeme(rx.asset.id)) newly.push(rx.asset.id);
    }
    if (rx.event && rx.event.a && rx.event.a.id) {
      if (saveUnlockedMeme(rx.event.a.id)) newly.push(rx.event.a.id);
    }
    // Special double-unlock: viewing a genuine NO_CONTEST result unlocks both mutual confusion cards
    if (outcome.id === "NO_CONTEST" || d.result === "NO_CONTEST") {
      if (saveUnlockedMeme("dan-huh")) newly.push("dan-huh");
      if (saveUnlockedMeme("sanbo-huh")) newly.push("sanbo-huh");
    }
    return { rx, newly };
  }

  function renderResult() {
    const d = S.day;
    if (d) d.result = stewardResult(d);
    const dk = d.dan ? d.dan.kibble : null, sk = d.sanbo ? d.sanbo.kibble : null, total = (dk || 0) + (sk || 0);
    const dp = total ? Math.round((dk / total) * 100) : null;
    const g = gameOutcome(d), pr = pred(), bet = betVerdict(g, pr.pick);
    const { rx, newly } = unlockMatchMemes(d, g, pr.pick);
    if (newly.length > 0) {
      if (g.id === "NO_CONTEST") {
        unlockToast("DOUBLE UNLOCK · PUZZLED CATS");
      } else if (rx.asset) {
        unlockToast(rx.asset.template.toUpperCase());
      }
    }
    const foreign = (d.events || []).filter((e) => e.type === "foreign_arrival");
    const ret = (d.events || []).find((e) => e.type === "return_to_feeder");
    const fin = (d.events || []).find((e) => e.type === "meal_finish");
    const fact = foreign.length ? `${foreign[0].time} · ${evInfo(foreign[0]).short}` : fin ? `${fin.time} · DAN BOWL CLEARED` : `DAN BOWL ${approx(d.kibble.start)} → ${d.kibble.end ?? "?"}`;
    const row = (k, v, t, tone = "white") => `<div class="rr"><span class="k">${esc(k)}</span><span class="v">${v}</span>${t ? `<span class="mtag tone-${tone}">${esc(t)}</span>` : "<span></span>"}</div>`;
    const sanOwn = (d.sessions || []).length ? `${d.sessions.length} SESSION${d.sessions.length > 1 ? "S" : ""} · EATING ${d.sessions.some((s) => s.eating === "yes") ? "SEEN" : "NOT SEEN"}`
      : ((d.sanbo && d.sanbo.own_line) || d.logitech_status || "NO SESSION DATA").toUpperCase();
    const who = (w) => (w === "dan" ? "P1 · DAN" : w === "sanbo" ? "P2 · SANBO" : "NO PICK");
    const winImg = g.winner === "dan" ? "assets/vs-dan-v2.png" : g.winner === "sanbo" ? "assets/vs-sanbo.png" : null;
    $("#s-result").innerHTML = `
      <section class="rp rp1" data-page="0">
        <header class="rhd"><b>RESULT</b><span>1/4 · ROUND ${esc(d.short)}</span></header>
        <!-- headline + reaction: the meme IS the visual (no second, plain cat portrait beside it) -->
        <div class="r1">
          <div class="r1-main">
            <div class="r1-head tone-${g.winner ? "p" + (g.winner === "dan" ? 1 : 2) : "white"}">
              <small>GAME OUTCOME${g.basis ? ` · ${esc(g.basis)}` : ""}</small><b>${esc(g.label)}</b>
              <em>${esc(g.rule)}</em>
            </div>
            <div class="betrow"><span>YOUR PICK · ${esc(who(pr.pick))}</span><b class="tone-${bet.tone}">${esc(bet.text)}</b></div>
            ${g.bonus ? `<div class="r1-bonus"><b>BONUS EVENT · ${esc(g.bonus.kind)}!</b><span>${esc(g.bonus.rel_time || g.bonus.time)} · ${esc(g.bonus.label)} · DOES NOT CHANGE THE RESULT</span></div>` : ""}
            <div class="r1-stew tone-${d.result.tone}"><b>EVIDENCE · ${esc(d.result.label)}</b><span>${esc(d.result.sub)} · STEWARDS LAYER, SEPARATE FROM THE GAME RESULT</span></div>
          </div>
          ${rx.asset ? `<figure class="r1-rx ${rx.asset.player === "P1" ? "p1" : "p2"}"><div class="r1-img"><img src="${esc(rx.asset.file)}" alt="Synthetic reaction: ${esc(rx.asset.template)}"><span class="synth">SYNTHETIC · NOT EVIDENCE</span></div>
            <figcaption>${esc(rx.rule.label || rx.asset.template)}</figcaption></figure>` : ""}
        </div>
        <footer class="rft"><span>◀ ▶ PAGE · A NEXT</span><span>B BACK · ▶ REWATCH · EJECT TAPES</span></footer>
      </section>
      <section class="rp rpm" data-page="1">
        <header class="rhd"><b>MATCH MEMORIES</b><span>2/4 · REAL EVIDENCE STILLS</span></header>
        ${renderMemories(d)}
        <footer class="rft"><span>◀ ▶ PAGE · A NEXT</span><span>T+ = TIME SINCE ${esc(memoriesFor(d).from)}</span></footer>
      </section>
      <section class="rp rp2" data-page="2">
        <header class="rhd"><b>MATCH STATS</b><span>3/4 · ${esc(d.label)}</span></header>
        <div class="rtable">
          ${row("P1 DAN AT DAN FEEDER", `${approx(dk)} KIBBLE`, dp == null ? null : `${dp}% · ${secsFloor(d.dan ? d.dan.bowl_s : null)}`, "p1")}
          ${row("P2 SANBO AT DAN FEEDER", `${approx(sk)} KIBBLE`, dp == null ? null : `${100 - dp}% · ${secsFloor(d.sanbo ? d.sanbo.bowl_s : null)}`, "p2")}
          ${row("DAN FEEDER BOWL", `${approx(d.kibble.start)} → ${d.kibble.end ?? "?"}`, (d.tapo_status || "?").toUpperCase(), d.meal_finished ? "green" : "red")}
          ${row("SANBO OWN FEEDER", esc(sanOwn), (d.logitech_status || "?").toUpperCase(), "blue")}
          ${foreign.length ? foreign.map((e) => row("SANBO RAID", e.time, "RAID SUCCESS", "red")).join("") : row("SANBO RAID", "NONE", "DEFENDED", "green")}
          ${g.bonus ? row(g.bonus.kind, g.bonus.rel_time || g.bonus.time, "BONUS · P1 IN P2 LANE", "p1") : ""}
          ${ret ? row("RETURN HOME", ret.time, "SANBO", "blue") : ""}
          ${row("MATCH DURATION", d.duration_str || (d.window ? d.window.duration : "04:44"), "FINISHED")}
        </div>
        <div class="evid tone-${d.result.tone}"><b>EVIDENCE · ${esc(d.result.label)}</b><span>${esc(d.result.sub)} · THEFT: ${esc(String(d.theft).toUpperCase())}${d.conflict ? " · KIBBLE SPLIT IS A MODEL ESTIMATE" : ""}</span></div>
        <div class="gamerule"><b>${esc(g.label)} ·</b> ${esc(g.rule)}</div>
        <footer class="rft"><span>◀ ▶ PAGE · A NEXT</span><span>PRINT = FULL REPORT</span></footer>
      </section>
      <section class="rp rp3" data-page="3">
        <header class="rhd"><b>REACTION</b><span>4/4 · SYNTHETIC · NOT EVIDENCE</span></header>
        ${rx.asset ? `<figure class="prime ${rx.asset.player === "P1" ? "p1" : "p2"}"><div class="pimg"><img src="${esc(rx.asset.file)}" alt="Synthetic reaction: ${esc(rx.asset.template)}"><span class="synth">SYNTHETIC · NOT EVIDENCE</span></div>
          <figcaption><b>${esc(rx.asset.player)} · ${esc(rx.asset.player === "P1" ? "DAN" : "SANBO")}</b><span>${esc(rx.rule.label || rx.asset.template)}</span><em>${esc(rx.rule.why)}</em>
          ${rx.event ? `<div class="evrx"><img src="${esc(rx.event.a.file)}" alt=""><span>${esc(rx.event.label)}</span></div>` : ""}</figcaption></figure>`
          : `<div class="norx">NO REACTION FOR THIS RESULT</div>`}
        <footer class="rft"><span>◀ PAGE · A CONTINUE</span><span>RULE: ${esc(rx.rule ? rx.rule.id : "none")}</span></footer>
      </section>`;
    showResultPage(S.resPage);
  }
  function showResultPage(i) {
    S.resPage = Math.max(0, Math.min(RESULT_PAGES - 1, i));
    $$("#s-result .rp").forEach((p, n) => p.classList.toggle("on", n === S.resPage));
    updateLCD(true);
  }

  function renderPrint() {
    const d = S.day;
    if (!d) return;
    const g = gameOutcome(d);
    const pr = pred();
    const bet = betVerdict(g, pr.pick);
    const rx = pickReaction(d, g, pr.pick);
    const mem = memoriesFor(d);
    const stw = stewardResult(d);

    const winnerText = g.winner === "dan" ? "P1 DAN WIN" : g.winner === "sanbo" ? "P2 SANBO WIN" : "NO CONTEST";
    const resClass = g.winner === "dan" ? "ps-dan" : g.winner === "sanbo" ? "ps-sanbo" : "ps-nc";

    const predHtml = pr.pick
      ? `<div class="ps-bet-badge tone-${bet.tone}">AVA'S PREDICTION: <b>${pr.pick.toUpperCase()}</b> · ${bet.text}</div>`
      : `<div class="ps-bet-badge tone-white">AVA'S PREDICTION: <b>NONE PLACED</b></div>`;

    const memCards = mem.items && mem.items.length
      ? mem.items.map((m) => `
          <div class="ps-mcard">
            <div class="ps-mimg"><img src="${esc(m.src)}" alt="${esc(m.cap)}"></div>
            <div class="ps-mcap"><b>${esc(m.rel)}</b> ${esc(m.cap)}</div>
          </div>
        `).join("")
      : `<div class="ps-mnone">NO CANONICAL SNAPSHOTS ARCHIVED</div>`;

    const eventsRows = d.events && d.events.length
      ? d.events.slice(0, 5).map((e) => `
          <div class="ps-ev-row">
            <span class="ps-ev-t">${e.time}</span>
            <span class="ps-ev-cam">${e.camera}</span>
            <span class="ps-ev-txt">${esc(e.notes)}</span>
          </div>
        `).join("")
      : `<div class="ps-ev-none">NO EVENT LOG IN THIS REPORT</div>`;

    $("#print-sheet").innerHTML = `
      <div class="ps-page ${resClass}">
        <!-- Header -->
        <div class="ps-top">
          <div class="ps-brand">
            <span class="ps-arcade">KIBBLE RUMBLE '94</span>
            <span class="ps-sub">NK-500R OFFICIAL MATCH DISPATCH · FAIR FEEDER CV</span>
          </div>
          <div class="ps-meta">
            <div class="ps-label">${esc(d.label)}</div>
            <div class="ps-round">ROUND ${esc(d.short)} · MATCH DURATION ${esc(d.duration_str || "04:44")}</div>
          </div>
        </div>

        <!-- Banner -->
        <div class="ps-banner">
          <div class="ps-res-col">
            <div class="ps-winner-badge">${winnerText}</div>
            <div class="ps-basis">${esc(g.basis)} · ${esc(g.rule)}</div>
          </div>
          ${predHtml}
        </div>

        <!-- Center: Meme + Stats -->
        <div class="ps-center">
          <div class="ps-meme-col">
            ${rx.asset ? `
              <div class="ps-meme-frame">
                <img src="${esc(rx.asset.file)}" alt="${esc(rx.asset.template)}">
                <span class="ps-synth-tag">SYNTHETIC REACTION · NOT EVIDENCE</span>
              </div>
              <div class="ps-meme-info"><b>${esc(rx.asset.player)} · ${esc(rx.asset.template)}</b></div>
            ` : `<div class="ps-no-meme">NO REACTION</div>`}
          </div>
          <div class="ps-stats-col">
            <div class="ps-steward-box tone-${stw.tone}">
              <div class="ps-stew-title">STEWARDS DECISION: ${esc(stw.label)}</div>
              <div class="ps-stew-sub">${esc(stw.sub)} · THEFT VERDICT: ${esc(String(d.theft).toUpperCase())}</div>
            </div>
            <div class="ps-stat-table">
              <div class="ps-srow"><span>P1 DAN AT DAN FEEDER</span><b>${approx(d.dan ? d.dan.kibble : null)} KIBBLE · ${secsFloor(d.dan ? d.dan.bowl_s : null)} BOWL TIME</b></div>
              <div class="ps-srow"><span>P2 SANBO AT DAN FEEDER</span><b>${approx(d.sanbo ? d.sanbo.kibble : null)} KIBBLE · ${secsFloor(d.sanbo ? d.sanbo.bowl_s : null)} BOWL TIME</b></div>
              <div class="ps-srow"><span>DAN FEEDER BOWL</span><b>${approx(d.kibble.start)} → ${d.kibble.end ?? "?"} · ${d.meal_finished ? "CLEARED" : "UNFINISHED"}</b></div>
              <div class="ps-srow"><span>SANBO OWN FEEDER</span><b>${esc(((d.sanbo && d.sanbo.own_line) || d.logitech_status || "NORMAL").toUpperCase())}</b></div>
              ${g.bonus ? `<div class="ps-srow highlight"><span>BONUS COUNTER-RAID</span><b>${esc(g.bonus.kind)} · ${esc(g.bonus.label)}</b></div>` : ""}
            </div>
          </div>
        </div>

        <!-- Match Memories Row -->
        <div class="ps-section">
          <div class="ps-sec-head">OFFICIAL MATCH MEMORIES (CANONICAL T+ FROM KIBBLE DISPENSE)</div>
          <div class="ps-mem-grid">${memCards}</div>
        </div>

        <!-- Event Log -->
        <div class="ps-section">
          <div class="ps-sec-head">KEY EVENTS LOG (RELATIVE TIMELINE)</div>
          <div class="ps-events-list">${eventsRows}</div>
        </div>

        <!-- Footer -->
        <div class="ps-footer">
          <span>KIBBLE RUMBLE '94 · VERIFIED CAT FEEDING MONITOR · NO HOUSEHOLD CLOCK TIMESTAMPS EXPOSED</span>
          <span>PAGE 1 OF 1</span>
        </div>
      </div>
    `;

    $("#paper-inner").innerHTML = `KIBBLE RUMBLE '94<br>${esc(d.short)} ${esc(d.dow)}<br>--------------<br>${esc(g.label)}<br>DAN ${approx(d.dan ? d.dan.kibble : null)}<br>SANBO ${approx(d.sanbo ? d.sanbo.kibble : null)}<br>BOWL ${approx(d.kibble.start)}→${d.kibble.end}<br>THEFT ${esc(String(d.theft).toUpperCase())}<br>--------------`;
  }

  /* ------------------------------------------------------------ video */
  async function prepareVideo() {
    const d = S.day;
    video.pause();
    if (!d.video || FILE_MODE) { video.removeAttribute("src"); video.load(); return; }
    if (!S.blobs[d.date]) {
      // blob URL = fully seekable even on servers without HTTP range support
      S.blobs[d.date] = fetch(d.video.src).then((r) => { if (!r.ok) throw new Error(r.status); return r.blob(); }).then((b) => URL.createObjectURL(b));
    }
    const url = await S.blobs[d.date];
    if (S.day !== d) return;
    video.src = url;
    await new Promise((res) => video.addEventListener("loadeddata", res, { once: true }));
    S.tl = TL();
    renderReplayStatic();
    video.currentTime = Math.max(0, tAt(d.window.t0));
    await new Promise((res) => video.addEventListener("seeked", res, { once: true }));
    S.lastClock = null;
    draw();
  }

  function draw() {
    if (!hasVideo() || video.readyState < 2) return;
    const L = S.day.video.layout;
    ctx.tapo.drawImage(video, 0, L.tapo_y, L.lane_w, L.lane_h, 0, 0, 720, 405);
    ctx.logi.drawImage(video, 0, L.logi_y, L.lane_w, L.lane_h, 0, 0, 720, 405);
    ctx.bar.drawImage(video, 0, L.bar_y, 720, L.bar_h, 0, 0, 720, L.bar_h);
  }

  function loop() {
    if (REPLAY_STATES.has(S.state)) {
      if (S.state === "replay") draw();
      const clock = nowClock();
      if (S.state === "replay" && S.lastClock != null) {
        for (const e of S.day.events) if (e.t > S.lastClock && e.t <= clock) toast(e);
      }
      if (S.state === "replay") S.lastClock = clock;
    }
    updateHud();
    requestAnimationFrame(loop);
  }

  async function loadDay(i) {
    S.dayIdx = i; S.day = DATA.days[i]; S.slow = false; S.evCursor = null; S.tl = null; S.resPage = 0; video.playbackRate = 1;
    const d = S.day;
    if (d) d.result = stewardResult(d);
    $("#topline-day").textContent = `${d.date === DATA.latest ? "LATEST IMPORTED MATCH" : "ARCHIVE MATCH"} · ${d.label}`;
    $("#cassette-label").textContent = d.replay && d.replay.status === "withheld" ? "WITHHELD" : `${d.date.slice(8)} ${d.label ? d.label.split(" ")[2] : "SEP"}`;
    renderVS(); renderReplayStatic(); renderShelf(); renderPrint();
    S.videoReady = prepareVideo().catch((err) => { console.warn("video", err); });
    refresh();
    return S.videoReady;
  }

  /* ------------------------------------------------------------ power / boot */
  async function powerOn(full) {
    S.power = true;
    const tok = ++S.bootTok;
    machine.dataset.first = "0";
    screen.classList.remove("crt-off"); void screen.offsetWidth; screen.classList.add("crt-on");
    setState("boot");
    const steps = full ? [["maker", 950], ["title", 1500], ["today", 950]] : [["title", 700]];
    for (const [step, ms] of steps) {
      bootEl.dataset.step = step;
      await sleep(ms);
      if (tok !== S.bootTok) return;
    }
    finishBoot();
  }
  function finishBoot() {
    if (S.state !== "boot") return;
    S.bootTok++;
    bootEl.dataset.step = "";
    setState("ready");
    try { localStorage.setItem("kr94.seen", "1"); } catch { /* storage optional */ }
  }
  function powerOff() {
    AUDIO.ui("power-off");
    S.power = false; S.bootTok++;
    video.pause(); machine.classList.remove("door-open");
    screen.classList.remove("crt-on"); void screen.offsetWidth; screen.classList.add("crt-off");
    setTimeout(() => { if (!S.power) { setState("off"); screen.classList.remove("crt-off"); } }, 460);
  }

  /* ------------------------------------------------------------ actions */
  async function play() {
    if (S.state === "archive") return S.arTab ? AUDIO.ui("tick") : selectArchive();
    if (S.day && S.day.replay && S.day.replay.status === "withheld") {
      const reason = String((S.day.replay && S.day.replay.withheld_reason) || "").toUpperCase();
      if (!reason || reason.includes("CLEARANCE") || reason.includes("UNAVAILABLE") || reason.includes("MISSING") || reason.includes("ABSENT") || reason.includes("NOT_INSPECTED") || reason.includes("INCOMPLETE") || reason.includes("COVERAGE")) {
        $("#nosig-text").textContent = "REPLAY WITHHELD · SAFETY CLEARANCE ABSENT";
      } else if (reason.includes("FACE")) {
        $("#nosig-text").textContent = "REPLAY WITHHELD · VISIBLE FACE DETECTED (PRIVACY GUARD)";
      } else if (reason.includes("POSITIVE_HUMAN") || reason.includes("HUMAN_PRESENCE") || reason.includes("HUMAN DETECTED") || reason.includes("DAN_HAND")) {
        $("#nosig-text").textContent = "REPLAY WITHHELD · HUMAN PRESENCE DETECTED (PRIVACY GUARD)";
      } else {
        $("#nosig-text").textContent = "REPLAY WITHHELD · PRIVACY GUARD TRIGGERED";
      }
      setState("nosignal");
      return;
    }
    if (!hasVideo() || FILE_MODE) {
      $("#nosig-text").textContent = FILE_MODE ? "OPEN VIA LOCAL SERVER" : "THIS TAPE HAS NO VIDEO";
      setState("nosignal"); return;
    }
    await S.videoReady;
    if (video.ended || video.currentTime >= video.duration - 0.05) video.currentTime = Math.max(0, tAt(S.day.window.t0));
    video.playbackRate = S.slow ? 0.5 : 1;
    S.lastClock = nowClock();
    setState("replay");
    try { await video.play(); } catch (e) { console.warn(e); }
    if (S.lockNote) { osd(S.lockNote, 1800); S.lockNote = null; }      // the match just started: say what got locked
    else osd(`PLAY ▶${S.slow ? " SLOW" : ""}`);
  }
  function stop() {
    const st = S.state;
    if (st === "replay") { video.pause(); setState("paused"); osd("STOP ■", 1500, "blue"); }
    else if (st === "paused" || st === "still" || st === "nosignal") { video.pause(); setState("ready"); osd("", 1); }
    else if (st === "archive") closeArchive();
    else if (st === "result") closeResult();
    else { osd("STOP ■", 700, "blue"); }
  }
  async function seekBy(delta) {
    if (!hasVideo()) return;
    await S.videoReady;
    const minC = clockAt(0), maxC = clockAt(video.duration || 0);
    const target = Math.min(maxC, Math.max(minC, nowClock() + delta));
    video.currentTime = Math.max(0, tAt(target));
    S.lastClock = target;
    if (!REPLAY_STATES.has(S.state)) setState("paused");
    glitch();
    AUDIO.ui("seek", delta > 0);
    osd(delta < 0 ? `◀◀ −${SKIP_S}s` : `▶▶ +${SKIP_S}s`, 900);
    video.addEventListener("seeked", draw, { once: true });
  }
  async function jumpEvent(dir, index) {
    const evs = S.day.events;
    if (!hasVideo()) return;
    if (!evs.length) { osd("NO EVENT LOG", 1200); return; }
    await S.videoReady;
    const clock = nowClock();
    let ti;
    if (index != null) ti = index;
    else {
      const cur = currentEventIndex(clock);
      // like a CD player: PREV first returns to the start of the current event if we are well past it
      ti = dir < 0 && cur >= 0 && clock - evs[cur].t > 2 ? cur : cur + dir;
    }
    if (ti < 0 || ti >= evs.length) { AUDIO.ui("tick"); osd(dir > 0 ? "LAST EVENT" : "FIRST EVENT", 900); return; }
    AUDIO.ui("nav", dir < 0);
    const target = evs[ti];
    S.evCursor = ti;
    const seekTarget = (target.seek_t != null ? target.seek_t : target.t);
    video.currentTime = Math.max(0, tAt(seekTarget + 0.05));
    S.lastClock = target.t + 0.05;
    if (!REPLAY_STATES.has(S.state) || S.state === "still") setState("paused");
    video.addEventListener("seeked", draw, { once: true });
    toast(target);
    osd(`${dir < 0 ? "|◀" : "▶|"} EVENT ${ti + 1}/${evs.length}`, 1000);
    S.hudKey = "";
  }
  async function still() {
    if (!hasVideo()) return;
    if (S.state === "still") { setState("paused"); osd("STOP ■", 900, "blue"); return; }
    await S.videoReady;
    video.pause();
    renderStill();
    setState("still");
    osd("STILL ❚❚", 1400);
  }
  function slow() {
    if (!hasVideo()) return;
    S.slow = !S.slow;
    video.playbackRate = S.slow ? 0.5 : 1;
    refresh();
    osd(S.slow ? "SLOW ½ · 2× REAL TIME" : "NORMAL · 4× REAL TIME", 1300);
  }
  function result() {
    if (S.state === "result") { closeResult(); return; }
    S.resultReturn = S.state === "replay" ? "paused" : ["postmatch", "archive", "nosignal", "boot"].includes(S.state) ? "ready" : S.state;
    video.pause();
    machine.classList.remove("door-open");
    const pr = pred(); pr.locked = true; pr.revealed = true; savePred(pr);   // seeing the result ends betting on this tape
    S.resPage = 0;
    renderResult(); renderShelf();
    setState("result");
    const bet = betVerdict(gameOutcome(S.day), pr.pick);
    setTimeout(() => { if (S.state === "result") AUDIO.ui(`bet-${bet.id}`); }, 1450);
  }
  function closeResult() {
    if (S.state !== "result") return;
    setState(["archive", "result", "boot", "off", "postmatch"].includes(S.resultReturn) ? "ready" : S.resultReturn);
    if (S.state === "ready") updatePick();
  }
  function print() {
    renderPrint();
    AUDIO.print();
    machine.classList.add("printing");
    updateLCD(true);
    setTimeout(() => {
      window.print();
      setTimeout(() => { machine.classList.remove("printing"); updateLCD(true); }, 1600);
    }, 1200);
  }
  function archive() {
    if (S.state === "archive") { closeArchive(); return; }
    S.archiveReturn = REPLAY_STATES.has(S.state) ? "paused" : "ready";
    video.pause();
    S.arSel = S.dayIdx; S.arTab = 0;
    renderArchive();
    machine.classList.add("door-open");
    AUDIO.ui("eject");
    setState("archive");
    osd("EJECT ⏏", 900);
  }
  function closeArchive() {
    machine.classList.remove("door-open");
    setState(S.archiveReturn);
  }
  async function selectArchive(i) {
    if (i != null) S.arSel = i;
    machine.classList.remove("door-open");
    AUDIO.ui("load");
    osd("LOADING TAPE…", 0);
    glitch();
    await loadDay(S.arSel);
    setState("ready");
    updatePick();
    osd("TAPE IN", 900);
  }
  function scrollRecord(dir) { const l = $("#s-archive .rec-list"); if (l) l.scrollBy(0, dir * 40); AUDIO.ui("tick"); }
  function scrollMemeCards(dir) { const w = $("#s-archive .mc-wrap"); if (w) w.scrollBy(0, dir * 50); AUDIO.ui("tick"); }
  function moveArchive(dir) {
    S.arSel = (S.arSel + dir + DATA.days.length) % DATA.days.length;
    $$(".ar-row").forEach((r, i) => r.classList.toggle("sel", i === S.arSel));
    $(`.ar-row[data-ar="${S.arSel}"]`)?.scrollIntoView({ block: "nearest" });
    AUDIO.ui("tick");
    updateLCD(true);
  }
  function back() {
    if (S.state === "result") return closeResult();
    if (S.state === "archive") return closeArchive();
    if (S.state === "still") return setState("paused");
    if (S.state === "paused" || S.state === "nosignal") return stop();
    if (S.state === "boot") return finishBoot();
  }

  /* context-aware: ◀/▶ pick a champion in READY, turn pages in RESULT, jump events in replay */
  function sideKey(dir) {
    if (S.state === "ready" && !pred().locked) return choose(dir < 0 ? "dan" : "sanbo");
    if (S.state === "archive") return setArchiveTab(dir);
    if (S.state === "result") { AUDIO.ui("tick"); return showResultPage(S.resPage + dir); }
    return jumpEvent(dir);
  }
  const ACTIONS = {
    power: () => (S.power ? powerOff() : powerOn(!seenBefore())),
    play: () => (S.state === "result" ? (closeResult(), play()) : play()),
    stop, still, slow, result, print, archive,
    rew: () => seekBy(-SKIP_S), ff: () => seekBy(SKIP_S),
    prev: () => sideKey(-1), next: () => sideKey(1),
  };

  /* NK-500R hardware key: key travel + click, then the machine action */
  function press(key) {
    const btn = $(`[data-key="${key}"]`);
    if (btn) { btn.classList.add("is-pressed"); setTimeout(() => btn.classList.remove("is-pressed"), 140); }
    click(key === "play" || key === "stop" || key === "power");
    if (!S.power) {
      if (key === "power" || ["play", "stop", "result", "archive", "print", "still", "slow", "prev", "next", "rew", "ff"].includes(key)) {
        if (window.KRAudio) KRAudio.unlock();
        return ACTIONS["power"]();
      }
      // non-game button while off: nudge the power key instead
      const p = $('[data-led="power"]'); p.classList.add("on", "blink"); setTimeout(() => p.classList.remove("on", "blink"), 900);
      machine.dataset.first = "1";
      return;
    }
    if (S.state === "boot" && key !== "power") { finishBoot(); return; }
    // MATCH COMPLETE: any game button reveals the result (POWER and PRINT keep their own meaning)
    if (S.state === "postmatch" && key !== "power" && key !== "print") { result(); return; }
    // in RESULT the transport/search keys have no meaning; only the page/tape/game keys do
    if (S.state === "result" && ["rew", "ff", "still", "slow"].includes(key)) { AUDIO.ui("tick"); return; }
    if (S.state === "ready" && S.day && !pred().locked && ["rew", "ff", "still", "slow"].includes(key)) { AUDIO.ui("tick"); osd("PRESS PLAY TO START THE MATCH", 1100); return; }
    if (btn && btn.disabled) return;
    ACTIONS[key]?.();
  }

  /* ONE command layer. Machine keys, keyboard shortcuts and both KR-94 pads all end here,
   * so every input surface drives the same action and the same state. */
  const KEY_FOR = { PLAY: "play", STOP: "stop", PREV_EVENT: "prev", NEXT_EVENT: "next", REW: "rew", FF: "ff",
    STILL: "still", SLOW: "slow", RESULT: "result", PRINT: "print", ARCHIVE: "archive", POWER: "power" };
  function command(cmd) {
    if (!S.power) {
      if (cmd === "ESC") return;
      if (window.KRAudio) KRAudio.unlock();
      return ACTIONS["power"]();
    }
    if (S.power && S.state === "postmatch" && !["POWER", "PRINT", "ESC"].includes(cmd)) { AUDIO.ui("confirm"); return result(); }
    switch (cmd) {
      case "TOGGLE": return command(S.state === "replay" ? "STOP" : "PLAY");
      case "CONFIRM":
        if (S.state === "boot") return finishBoot();
        if (S.state === "archive") { if (S.arTab) { AUDIO.ui("tick"); return; } AUDIO.ui("confirm"); return selectArchive(); }
        if (S.state === "result") { AUDIO.ui("confirm"); return S.resPage < RESULT_PAGES - 1 ? showResultPage(S.resPage + 1) : closeResult(); }
        return press("play");
      case "BACK":              // pad B: back out of result/archive/still, otherwise the STOP key
        if (["result", "archive", "still", "boot"].includes(S.state)) { AUDIO.ui("tick"); return back(); }
        return press("stop");
      case "ESC": return back();
      case "MENU_UP": case "MENU_DOWN": {
        const dir = cmd === "MENU_UP" ? -1 : 1;
        if (S.state === "archive") return S.arTab === 1 ? scrollRecord(dir) : S.arTab === 3 ? scrollMemeCards(dir) : S.arTab ? AUDIO.ui("tick") : moveArchive(dir);
        if (S.state === "result") { AUDIO.ui("tick"); return showResultPage(S.resPage + dir); }
        AUDIO.ui("tick"); return;
      }
      default: {
        const key = KEY_FOR[cmd];
        if (!key) return;
        // in the tape library only tape/menu keys mean something; transport keys just click
        if (S.state === "archive" && ["rew", "ff", "still", "slow"].includes(key)) { AUDIO.ui("tick"); return; }
        return press(key);
      }
    }
  }

  function seenBefore() { try { return localStorage.getItem("kr94.seen") === "1"; } catch { return false; } }

  /* ------------------------------------------------------------ input wiring */
  $$("[data-key]").forEach((b) => {
    b.addEventListener("click", (ev) => { ev.preventDefault(); press(b.dataset.key); });
  });
  $("#vol").addEventListener("input", (e) => { if (window.KRAudio) { KRAudio.setVolume(+e.target.value); soundIndicators(); } });
  // after a mouse/touch adjustment hand focus back to the machine, so arrow keys drive the game again
  $("#vol").addEventListener("pointerup", (e) => e.currentTarget.blur());
  $("#vol-label").addEventListener("click", () => { if (window.KRAudio) { KRAudio.unlock(); KRAudio.toggleMute(); soundIndicators(); } });
  if (window.KRAudio) KRAudio.onChange = () => soundIndicators();
  screen.addEventListener("click", (e) => {
    if (!S.power) {
      if (window.KRAudio) KRAudio.unlock();
      ACTIONS["power"]();
      return;
    }
    if (S.state === "boot") return finishBoot();
    const fbtn = e.target.closest(".fp-btn");
    if (fbtn) {
      const sub = parseInt(fbtn.dataset.fsub || "0", 10);
      S.fighterSub = sub;
      renderArchive();
      return;
    }
    const pk = e.target.closest("[data-pick]");
    if (pk && S.state === "ready") return choose(pk.dataset.pick);
    const row = e.target.closest(".ar-row");
    if (row) return selectArchive(+row.dataset.ar);
  });
  const sOffEl = $("#s-off");
  if (sOffEl) {
    sOffEl.addEventListener("keydown", (e) => {
      if (e.key === "Enter" || e.key === " ") {
        e.preventDefault();
        if (!S.power) {
          if (window.KRAudio) KRAudio.unlock();
          ACTIONS["power"]();
        }
      }
    });
  }
  $("#course").addEventListener("click", (e) => {
    const pip = e.target.closest(".pip");
    if (!S.power || !hasVideo()) return;
    if (pip) { jumpEvent(0, +pip.dataset.ev); return; }
    const r = e.currentTarget.querySelector(".ctrack").getBoundingClientRect(), f = Math.min(1, Math.max(0, (e.clientX - r.left) / r.width));
    const t = TL(), c = t.c0 + f * (t.c1 - t.c0);
    video.currentTime = Math.max(0, tAt(c)); S.lastClock = c;
    if (S.state === "still") setState("paused");
    video.addEventListener("seeked", draw, { once: true });
  });
  $("#shelf").addEventListener("click", async (e) => {
    const t = e.target.closest(".tape");
    if (!t) return;
    click(true);
    if (!S.power) {
      if (window.KRAudio) KRAudio.unlock();
      await loadDay(+t.dataset.tape);
      ACTIONS["power"]();
      return;
    }
    closeResult(true);
    S.arSel = +t.dataset.tape;
    machine.classList.add("door-open");
    await sleep(380);
    selectArchive();
  });
  // the real end of the tape: MATCH COMPLETE → press any button → RESULT
  video.addEventListener("ended", () => { if (S.state === "replay") { setState("postmatch"); osd("", 1); } });

  const KEYMAP = { " ": "TOGGLE", ArrowLeft: "PREV_EVENT", ArrowRight: "NEXT_EVENT", ArrowUp: "MENU_UP", ArrowDown: "MENU_DOWN",
    Enter: "CONFIRM", Escape: "ESC", "[": "REW", "]": "FF", s: "STILL", l: "SLOW", r: "RESULT", p: "PRINT", a: "ARCHIVE", o: "POWER" };
  document.addEventListener("keydown", (e) => {
    if (e.metaKey || e.ctrlKey || e.altKey) return;
    if (e.target instanceof HTMLInputElement) return;
    const cmd = KEYMAP[e.key.length === 1 ? e.key.toLowerCase() : e.key];
    if (!cmd) return;
    e.preventDefault();
    command(cmd);
  });

  /* desktop sizes between phone and full width: scale the whole machine like a photo of it */
  function fit() {
    const w = window.innerWidth;
    const z = w > 860 ? Math.min(1, (w - 48) / 1240) : 1;
    machine.style.zoom = z === 1 ? "" : z;
    $(".desk").style.zoom = z === 1 ? "" : z;
  }
  window.addEventListener("resize", fit);

  /* ------------------------------------------------------------ start */
  fit();
  const isPlayable = (d) => !!(d && d.video && d.video.src && (!d.replay || d.replay.status !== "withheld"));
  const playableIdx = DATA.days.findIndex(isPlayable);
  const start = playableIdx >= 0 ? playableIdx : Math.max(0, DATA.days.findIndex((d) => d.date === DATA.latest));
  loadDay(start);
  const params = new URLSearchParams(location.search);
  if (params.has("tape")) { const i = DATA.days.findIndex((d) => d.date === params.get("tape")); if (i >= 0) loadDay(i); }
  machine.dataset.first = seenBefore() ? "0" : "1";
  setState("off");
  if (seenBefore() || params.has("on")) setTimeout(() => powerOn(false), 350);
  requestAnimationFrame(loop);
  if (FILE_MODE) $("#file-notice").hidden = false;
  window.__KR = { S, press, command, getState: () => S.state, loadDay, jumpEvent, onState: (fn) => S.listeners.push(fn), audio: window.KRAudio, gameOutcome, betVerdict, vaultSlot, getUnlockedMemes, saveUnlockedMeme, unlockMatchMemes, scrollMemeCards, MEME_CARDS }; // review / test hook
})();
