# KIBBLE RUMBLE '94

> **A retro 1994 arcade replay machine and daily cat feeding championship for Dan and Sanbo powered by computer vision.**

🕹️ **[Play Live Demo](https://iknoest.github.io/kibble-rumble/)** · 🎬 **[Watch Showcase Videos](#watch-showcase--experience)** · 📐 **[Technical Architecture](#technical-architecture)** · 🐾 **[Fair Feeder Core](fair-feeder/README.md)**

![KIBBLE RUMBLE '94 Arcade Machine](assets/og-preview.png)

## Watch Showcase & Experience

- 🕹️ **[Play Live Demo](https://iknoest.github.io/kibble-rumble/)** — Interactive retro arcade replay machine running in your browser on GitHub Pages.
- 📐 **[Technical Architecture](#technical-architecture)** — Complete dual-camera CV pipeline, active learning flywheel, and fail-closed privacy gate.
- 🎬 **[Watch 55s Walkthrough (MP4)](https://github.com/iknoest/kibble-rumble/releases/download/v1.0.0/KR94_LinkedIn_55s_v2.mp4)** — Full end-to-end system walkthrough (cameras, edge detection, CRT replay, and match memories).
- ⚡ **[Watch 18s Short Version (MP4)](https://github.com/iknoest/kibble-rumble/releases/download/v1.0.0/KR94_Instagram_18s_v2.mp4)** — Fast-paced action highlight reel.

> 📦 *High-definition showcase videos, subtitles, and poster thumbnails are delivered via [GitHub Release `v1.0.0`](https://github.com/iknoest/kibble-rumble/releases/tag/v1.0.0) to preserve clean repository history.*

## Quick Navigation

- 🕹️ **[Live Demo](https://iknoest.github.io/kibble-rumble/)** — Playable 1994 CRT arcade replay machine in your browser.
- 📐 **[Technical Architecture](#technical-architecture)** — Dual-camera edge CV, active learning flywheel, and fail-closed privacy gate.
- 🎬 **[Showcase Videos](#watch-showcase--experience)** — Watch the 55s system walkthrough or the 18s fast-paced short reel.
- 🐾 **[Fair Feeder Core](fair-feeder/README.md)** — Curated computer-vision engine, domain models, and test fixtures.

## What is this?

**KIBBLE RUMBLE '94** turns Dan and Sanbo's daily morning breakfast into an interactive retro arcade championship. Powered by computer-vision detection and automated feeding analysis, each morning's feeding session becomes a playable arcade tape on the fictional **NIKUKYU NK-500R** color video monitor.

## The Real Setup

![The Real Setup: Dual-Feeder CV Monitor](assets/real-setup.png)

This isn't a synthetic simulation — it runs on a real dual-feeder multi-camera setup in the home:

- **Two Feeders, Two Bowls**: Dan and Sanbo each have their own automated feeding station in separate areas of the home.
- **Dan's Feeder (Lane 1)**: Monitored 24/7 by an overhead Tapo C210 infrared camera. This is the primary defense arena where Dan's breakfast is dispensed.
- **Sanbo's Feeder (Lane 2)**: Monitored by a ground-level Logitech C925e USB camera. This is Sanbo's personal feeding station and home base.
- **The Core Premise**: The match outcome centers on whether Dan can successfully defend **Dan's bowl**.
- **Sanbo Raids**: Sanbo wins the championship game layer by crossing over and entering Dan's feeder area (canonical Lane 1 foreign arrival). Under house rules, entering is sufficient for raid success.
- **Dan Counter-Raids**: Dan can also sneak over to visit Sanbo's feeder, triggering bonus counter-raid events on the timeline!

## Technical Architecture

KIBBLE RUMBLE '94 is powered by **Fair Feeder**, an edge computer-vision feeding monitor:

[![Fair Feeder System Architecture](assets/architecture-diagram.png)](assets/architecture-diagram.png)

*Click image to view full size. Formats: [Full-Resolution PNG (1080p)](assets/architecture-diagram.png) · [Vector SVG (Editable)](assets/architecture-diagram.svg) · [Architecture Documentation](fair-feeder/architecture.md)*

| Stage | Checkpoint / Layer | Real Project Implementation |
| :--- | :--- | :--- |
| **Stage A** | **Physical Setup** | Dual automated feeders & stainless bowls in separate rooms. Tapo C210 IR camera on tripod (Lane 1 / Dan) + Logitech C925e USB camera (Lane 2 / Sanbo). Raspberry Pi 5 with MOG2 motion capture and circular pre-roll ring buffer. |
| **Stage B** | **Roboflow & YOLOv11** | Curated "IR kibble" Roboflow project (930+ labeled frames, 5 domain classes: `Dan`, `Sanbo`, `Dan_hand`, `Bowl`, `Kibble`). Native 16:9 YOLOv11 detector (`rect=True`). Active learning auto-flagger (`flagger.py`) for continuous retraining. Historical V14 val benchmark: $mAP_{50} = 0.957$. |
| **Stage C** | **Daily Telegram Ops** | Automated breakfast analysis pipeline. Discrete event timeline extraction (`food_dispensed` $T+0$, `cat_arrival`, `foreign_arrival`, `meal_finish`). Feederbot daily report in private "feeder monitor" Telegram group with meal stats, health heartbeat, and annotated IR verification stills. |
| 🔒 **Gate** | **Fail-Closed Privacy Gate** | On-premise security boundary: Wall-clock normalized to relative match time ($T+00:00$); fail-closed Person Safety withholding if human (`Dan_hand`) detected; 16:9 crop framing & background masking; audio stripped; 3+3 replay vault retention. |
| **Stage D** | **Figma Experience Design** | "Game Room v4" productization design system translating raw telemetry into a 1994 retro arcade championship. NIKUKYU NK-500R 14" Trinitron-style virtual CRT monitor with scanlines, audio toggles, lane switcher, and head-to-head arcade HUD. |
| **Stage E** | **GitHub Public Web App** | Curated technical core (`fair-feeder/` domain models, schemas, and public test fixtures). Clean git history with zero household images or secrets. Showcase videos delivered via GitHub Release `v1.0.0`. Live playable daily match championship on GitHub Pages. |

> 📖 **Deep Dive**: Read the complete technical specification in [`fair-feeder/architecture.md`](fair-feeder/architecture.md), or explore the curated engine code in [`fair-feeder/`](fair-feeder/README.md).

## The Contestants

- 🥊 **Dan (P1)**: 5-year-old Tuxedo cat. Defending champion at Dan's bowl. Role: defends his breakfast.
- 😼 **Sanbo (P2)**: 1-year-old Calico cat. Agile challenger and raid specialist. Role: raids Dan's bowl.

## Championship Rules

- **Dan Win · Defended**: Sanbo never enters Dan's bowl area, and Dan successfully clears his breakfast.
- **Sanbo Win · Raid Success**: Canonical TAPO foreign arrival of Sanbo at Dan's feeder. Under house rules, entering is sufficient for game-layer raid success.
- **Dan Counter-Raid**: Bonus event when Dan visits Sanbo's feeder (`LOGITECH`). Classed as Counter-Raid if following a Sanbo raid, otherwise Dan Raid.
- **No Contest / Void**: Unresolved match: unfinished breakfast, sensor blackout, or missing event timeline.

## Privacy & Sanitization

All public media published to this repository is automatically sanitized:
- **Relative Match Time**: Household wall-clock times are replaced with relative match time ($T+00:00 = \text{Kibble Drop}$).
- **Person Safety Rule**: Fail-closed withholding of replay video if human presence is detected (`Dan_hand`).
- **Privacy Masking**: Household backgrounds and absolute timestamps are masked.
- **Single-Camera Framing**: Evidence stills and replays isolate the feeding area in clean 16:9 crops.
- **No Audio**: Surveillance audio is completely stripped from public replay clips.
- **Deterministic Retention**: Replay vault retains max 6 active matches (top 3 Dan wins + top 3 Sanbo wins).

---

*Powered by [Fair Feeder](fair-feeder/README.md) · Hosted on GitHub Pages · Zero server fees*
