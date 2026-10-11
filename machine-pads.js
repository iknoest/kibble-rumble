/* KIBBLE RUMBLE '94 · KR-94 SUPER PAD ×2 — review prototype.
 * Two physical-feeling retro pads (SN30/SF30-generation proportions, original design, no hands).
 * P1 = DAN, P2 = SANBO. Every pad button calls window.__KR.command(): the same command layer the
 * NK-500R keys and the keyboard use, so there is no second control system.
 * Pads can be dragged by their shell (mouse / touch / pen); buttons keep working wherever they lie. */
(() => {
  "use strict";
  const KR = window.__KR;
  if (!KR) return;
  const stage = document.querySelector(".stage"), layer = document.querySelector("#pads"), bay = document.querySelector("#pad-bay");
  const MAP = { left: "PREV_EVENT", right: "NEXT_EVENT", up: "MENU_UP", down: "MENU_DOWN", a: "CONFIRM", b: "BACK",
    x: "STILL", y: "SLOW", l: "REW", r: "FF", start: "RESULT", select: "ARCHIVE" };
  const ARIA = { left: "previous event", right: "next event", up: "menu up", down: "menu down", a: "A: play / confirm", b: "B: stop / back",
    x: "X: still frame", y: "Y: slow", l: "L: minus 15 seconds", r: "R: plus 15 seconds", start: "START: result", select: "SELECT: tape library" };
  // small physical rock of the shell when a button is pressed: [rotateX, rotateY] in degrees
  const ROCK = { left: [0, -1.1], right: [0, 1.1], up: [1.3, 0], down: [-1.3, 0], a: [0, 0.9], b: [-0.7, 0.5], x: [0.7, 0.5], y: [0, 0.3],
    l: [-1.8, -0.5], r: [-1.8, 0.5], start: [0.4, 0.1], select: [0.4, -0.1] };
  const W = 330, H = 150;
  const clamp = (v, a, b) => Math.max(a, Math.min(b, v));
  const mobile = () => window.innerWidth <= 860;
  const KEY = () => `kr94.pads.${mobile() ? "m" : "d"}`;

  function padHTML(n) {
    const name = n === 1 ? "DAN" : "SANBO";
    const b = (pb, cls, inner = "") => `<button type="button" tabindex="-1" class="pb ${cls}" data-pb="${pb}" aria-label="P${n} pad ${ARIA[pb]}">${inner}</button>`;
    return `<div class="pad-scale"><div class="pad-lift">
      <div class="pad-shadow"></div>
      ${b("l", "sh sh-l", "<i>L</i>")}${b("r", "sh sh-r", "<i>R</i>")}
      <div class="pad-shell">
        <span class="pad-sticker">P${n} · ${name}</span>
        <span class="pad-led"></span>
        <div class="dpad-dish"><div class="dpad">
          ${b("up", "d d-up")}${b("down", "d d-down")}${b("left", "d d-left")}${b("right", "d d-right")}<span class="d-hub"></span>
        </div></div>
        <div class="mid">${b("select", "pill", "")}${b("start", "pill", "")}<span class="mid-lab">SELECT</span><span class="mid-lab r">START</span></div>
        <div class="face-well"></div>
        ${b("x", "fb fb-x", "")}${b("y", "fb fb-y", "")}${b("a", "fb fb-a", "")}${b("b", "fb fb-b", "")}
        <span class="fl fl-x">X</span><span class="fl fl-y">Y</span><span class="fl fl-a">A</span><span class="fl fl-b">B</span>
        <span class="pad-brand">KR-94 SUPER PAD</span>
      </div></div></div>`;
  }

  const pads = [1, 2].map((n) => {
    const el = document.createElement("div");
    el.className = `pad pad-${n}`;
    el.dataset.player = String(n);
    el.innerHTML = padHTML(n);
    layer.appendChild(el);
    return { n, el, x: 0, y: 0, rest: 0, ps: 1 };
  });

  /* ------------------------------------------------------------ placement */
  function geometry() {
    const sr = stage.getBoundingClientRect(), br = bay.getBoundingClientRect();
    return { sw: stage.scrollWidth, sh: stage.scrollHeight, cx: sr.width / 2, bx: br.left - sr.left, by: br.top - sr.top, bw: br.width, bh: br.height };
  }
  function defaults(p, g) {
    if (mobile()) {
      const ps = clamp((window.innerWidth - 40) / W, 0.6, 0.86);
      return { ps, cx: g.cx + (p.n === 1 ? -14 : 14), cy: g.by + (p.n === 1 ? 64 : 190) * (ps / 0.82), rest: p.n === 1 ? -4 : 3.5 };
    }
    return { ps: 1, cx: g.cx + (p.n === 1 ? -255 : 255), cy: g.by + g.bh / 2 + (p.n === 1 ? 4 : -4), rest: p.n === 1 ? -5 : 4.5 };
  }
  function place(p, cx, cy) {
    const g = geometry(), w = W * p.ps, h = H * p.ps;
    p.x = clamp(cx - w / 2, 4, g.sw - w - 4);
    p.y = clamp(cy - h / 2, 4, g.sh - h - 4);
  }
  function render(p, extraRot = 0) {
    p.el.style.width = `${W * p.ps}px`; p.el.style.height = `${H * p.ps}px`;
    p.el.style.setProperty("--ps", p.ps);
    p.el.style.transform = `translate(${p.x}px, ${p.y}px) rotate(${p.rest + extraRot}deg)`;
  }
  function load() {
    try { return JSON.parse(localStorage.getItem(KEY()) || "null"); } catch { return null; }
  }
  function save() {
    const g = geometry();
    const data = {};
    for (const p of pads) data[p.n] = { dx: p.x + (W * p.ps) / 2 - g.cx, y: p.y + (H * p.ps) / 2, rest: +p.rest.toFixed(2) };
    try { localStorage.setItem(KEY(), JSON.stringify(data)); } catch { /* optional */ }
  }
  function layout(reset) {
    if (drag) return;                           // never yank a pad out of the hand mid-drag
    const g = geometry(), saved = reset === true ? null : load();
    for (const p of pads) {
      const d = defaults(p, g);
      p.ps = d.ps;
      const s = saved && saved[p.n];
      if (s && !(reset === p.n || reset === true)) { p.rest = s.rest; place(p, g.cx + s.dx, s.y); }
      else { p.rest = d.rest; place(p, d.cx, d.cy); }
      render(p);
    }
  }

  /* ------------------------------------------------------------ drag (shell only) */
  let drag = null, zTop = 3;
  for (const p of pads) {
    p.el.addEventListener("pointerdown", (e) => {
      if (e.target.closest(".pb") || e.button > 0) return;
      e.preventDefault();
      try { p.el.setPointerCapture(e.pointerId); } catch { /* synthetic pointer: moves still arrive on the pad */ }
      p.el.style.zIndex = String(++zTop);
      drag = { p, id: e.pointerId, sx: e.clientX, sy: e.clientY, ox: p.x, oy: p.y, lx: e.clientX, lt: performance.now(), vx: 0, tilt: 0 };
      p.el.classList.remove("settling");
      p.el.classList.add("dragging");
    });
    p.el.addEventListener("pointermove", (e) => {
      if (!drag || drag.p !== p || drag.id !== e.pointerId) return;
      const g = geometry(), w = W * p.ps, h = H * p.ps, now = performance.now(), dt = Math.max(8, now - drag.lt);
      p.x = clamp(drag.ox + e.clientX - drag.sx, 4, g.sw - w - 4);
      p.y = clamp(drag.oy + e.clientY - drag.sy, 4, g.sh - h - 4);
      drag.vx = drag.vx * 0.75 + ((e.clientX - drag.lx) / dt) * 0.25;   // px/ms, smoothed
      drag.tilt = clamp(drag.vx * 7, -9, 9);                            // a held object leans into the motion
      drag.lx = e.clientX; drag.lt = now;
      render(p, drag.tilt);
    });
    const end = (e) => {
      if (!drag || drag.p !== p || drag.id !== e.pointerId) return;
      // set down: keep a little of the lean, settle without bounce
      p.rest = clamp(p.rest + drag.tilt * 0.35, -16, 16);
      p.el.classList.remove("dragging");
      p.el.classList.add("settling");
      render(p);
      setTimeout(() => p.el.classList.remove("settling"), 280);
      drag = null;
      save();
    };
    p.el.addEventListener("pointerup", end);
    p.el.addEventListener("pointercancel", end);
    p.el.addEventListener("dblclick", (e) => { if (!e.target.closest(".pb")) { layout(p.n); save(); } });
  }

  /* ------------------------------------------------------------ buttons → the shared command layer */
  function pressBtn(p, btn) {
    const pb = btn.dataset.pb, lift = p.el.querySelector(".pad-lift"), [rx, ry] = ROCK[pb] || [0, 0];
    btn.classList.add("down");
    lift.style.setProperty("--rx", `${rx}deg`); lift.style.setProperty("--ry", `${ry}deg`);
    p.el.classList.add("blink");
    if (window.KRAudio) KRAudio.ui("pad");
    KR.command(MAP[pb]);
    setTimeout(() => {
      btn.classList.remove("down");
      lift.style.setProperty("--rx", "0deg"); lift.style.setProperty("--ry", "0deg");
      p.el.classList.remove("blink");
    }, 120);
  }
  for (const p of pads) {
    p.el.querySelectorAll(".pb").forEach((btn) => {
      btn.addEventListener("pointerdown", (e) => { e.preventDefault(); e.stopPropagation(); pressBtn(p, btn); });
      btn.addEventListener("click", (e) => { if (e.detail === 0) pressBtn(p, btn); });   // assistive-tech activation only
    });
  }

  /* ------------------------------------------------------------ machine state hooks */
  KR.onState((st) => {
    layer.classList.toggle("powered", st !== "off");
    // RESULT now lives inside the CRT, so the pads simply stay on the desk
  });
  layer.classList.toggle("powered", KR.S.state !== "off");
  window.addEventListener("resize", () => layout(false));
  window.addEventListener("load", () => layout(false));
  layout(false);
  window.__KR.pads = { layout, positions: () => pads.map((p) => ({ n: p.n, x: Math.round(p.x), y: Math.round(p.y), rest: +p.rest.toFixed(1) })) };
})();
