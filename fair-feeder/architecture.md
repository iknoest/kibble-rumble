# Fair Feeder Architecture & Technical Design

Fair Feeder is an automated computer-vision monitoring engine designed to supervise daily cat feeding across multiple feeding stations. It extracts discrete feeding events from video streams, tracks kibble consumption, resolves cross-camera feeding attribution, and projects sanitized match telemetry into [KIBBLE RUMBLE '94](https://iknoest.github.io/kibble-rumble/).

---

## 1. System Topology

[![Fair Feeder System Architecture](../assets/architecture-diagram.png)](../assets/architecture-diagram.png)

*View [Full-Resolution PNG (1080p)](../assets/architecture-diagram.png) · [Vector SVG (Editable)](../assets/architecture-diagram.svg)*

```
+---------------------------------------------------------------------------------------------------+
|                           PRIVATE HOUSEHOLD OPERATIONS (LAN / EDGE / TELEGRAM)                    |
|                                                                                                   |
|  [STAGE A · PHYSICAL SETUP]                                                                       |
|  * Lane 1 (Dan / Arena): Timed auto-feeder + Tapo C210 2K IR overhead camera on tripod (24/7 IR)  |
|  * Lane 2 (Sanbo / Base): Ground-level feeder + Logitech C925e USB camera (ambient daylight)      |
|  * Raspberry Pi 5: MOG2 motion detection + circular RAM pre-roll ring buffer (5-10s lead-in)      |
|                                          │                                                        |
|                                          ▼ (Candidate frames & motion clips)                      |
|  [STAGE B · ROBOFLOW & YOLOv11]                                                                   |
|  * Roboflow "IR kibble" dataset (930+ labeled frames; classes: Dan, Sanbo, Dan_hand, Bowl, Kibble)|
|  * YOLOv11 edge model (native 16:9 rect=True; historical V14 val benchmark mAP50 = 0.957)         |
|  * Active learning flywheel (flagger.py cache triage: blips, dual-cat conflicts, kibble jumps>=15)|
|                                          │                                                        |
|                                          ▼ (Inference weights & edge deployment)                  |
|  [STAGE C · DAILY TELEGRAM OPS]                                                                   |
|  * Breakfast analysis: discrete event extraction (food_dispensed T+0, arrival, foreign raid)     |
|  * Feederbot morning report in private "feeder monitor" group with meal stats & health heartbeat  |
|  * Forensic verification stills (annotated infrared frame with YOLOv11 bounding boxes)            |
|  * Decoupled household ruleset (v10.4): Game outcome layer vs independent Stewards evidence layer|
+---------------------------------------------------------------------------------------------------+
                                           │
                                           ▼ (Raw event telemetry & clips)
+---------------------------------------------------------------------------------------------------+
|                                 FAIL-CLOSED PRIVACY GATE (SECURITY BOUNDARY)                      |
|                                                                                                   |
|  1. Person Safety Rule: Fail-closed withholding of media if human presence (Dan_hand) detected    |
|  2. Relative Match Time: Normalizes wall-clock to T+00:00 (kibble drop anchor); hides schedules   |
|  3. Visual Masking: 16:9 crop framing strictly isolates bowl arenas; room background masked       |
|  4. Surveillance Audio Removal: All ambient audio stripped; synthesized 8-bit arcade SFX only     |
|  5. Deterministic Vault Retention: Strictly 3 Dan wins + 3 Sanbo raids (max 6 active replays)     |
+---------------------------------------------------------------------------------------------------+
                                           │
                                           ▼ (Sanitized match telemetry)
+---------------------------------------------------------------------------------------------------+
|                               PUBLIC SHOWCASE & INTERACTIVE REPLAY                                |
|                                                                                                   |
|  [STAGE D · FIGMA EXPERIENCE DESIGN]                                                              |
|  * "Game Room v4" productization design system translating CV telemetry into 1994 retro arcade    |
|  * NIKUKYU NK-500R 14" Trinitron CRT emulator: scanlines, audio toggles, lane switcher, HUD      |
|                                          │                                                        |
|                                          ▼ (Arcade UI assets & presentation code)                 |
|  [STAGE E · GITHUB PUBLIC WEB APP]                                                                |
|  * Public GitHub Repository (iknoest/kibble-rumble): curated technical core (fair-feeder/)        |
|  * Clean git history with zero household images; showcase videos delivered via Release v1.0.0     |
|  * Live GitHub Pages Web Application (iknoest.github.io/kibble-rumble): playable daily bouts      |
+---------------------------------------------------------------------------------------------------+
```

---

## 2. Multi-Lane Physical Feeder Concept

The system monitors two physical feeding stations in separate areas of the home:

| Lane | Camera Hardware | Primary Cat | Purpose / Arena Role |
| :--- | :--- | :--- | :--- |
| **Lane 1** | Tapo C210 (Overhead IR) | **Dan** | **The Arena**: Primary defense bowl where Dan's breakfast is dispensed. |
| **Lane 2** | Logitech C925e (Ground USB) | **Sanbo** | **Home Base**: Sanbo's personal feeder; secondary surveillance lane. |

### Feeder Identity vs Cat Identity
- **Feeder Identity** is fixed by camera installation configuration (`Lane 1 = Dan's feeder`, `Lane 2 = Sanbo's feeder`).
- **Cat Identity** is determined dynamically by computer-vision model inference (`Dan` vs `Sanbo`).

---

## 3. Computer Vision & Roboflow Dataset Layer (Stage B)

### Roboflow Dataset Curation ("IR kibble")
Ground truth annotations are managed through the Roboflow project `IR kibble` (930+ curated and annotated frames):
- **Multi-Class Annotations**: 5 domain classes:
  1. `Dan`: Tuxedo cat (black & white coat, white chest/paws).
  2. `Sanbo`: Calico cat (tricolor calico pattern, agile build).
  3. `Dan_hand`: Human hand/arm during manual feeder maintenance (Person Safety gate trigger).
  4. `Bowl`: Feeding dish boundary.
  5. `Kibble`: Individual dry food pellets.
- **Split Hygiene**: Strict Train / Validation / Test separation enforced by feeding session to eliminate temporal data leakage.
- **Spectral Balance**: Stratified curation combines zero-lux 850nm infrared frames (Tapo IR) and ambient daylight frames (Logitech USB).

### YOLOv11 Edge Detection Core
- Custom YOLOv11 edge model fine-tuned for small-object (kibble) and low-contrast IR detection.
- Native 16:9 aspect ratio preserved (`rect=True`, single `imgsz`) to eliminate bounding-box stretching distortion.
- Dynamic class index mapping using `model.names` (never hardcoded integer indexes).
- **Validation Benchmark Context**: Historical V14 split benchmark achieved $mAP_{50} = 0.957$. (Note: Benchmark is split-dependent; evaluated continuously via active learning).

---

## 4. Daily Operations & Feederbot Telegram Reporting (Stage C)

### Automated Morning Analysis Pipeline
The operational pipeline executes daily at breakfast time:
- Ingests motion clips captured during morning feeding sessions.
- Runs YOLOv11 inference across temporal clips, stitching sequences where inter-clip gaps $\le 10\text{s}$.
- Derives discrete timeline events:
  - `food_dispensed`: Kibble released into bowl. Defines relative match zero ($T+00:00$).
  - `cat_arrival`: Primary cat arrives at home feeder.
  - `foreign_arrival`: Cross-feeder visit (Sanbo raid attempt at Dan's bowl).
  - `meal_finish`: Bowl cleared and cat departs.
  - Pre-cat kibble snapshot: Emits clean pre-cat kibble dispensed snapshot before cat arrival.

### Feederbot Telegram Morning Report
Operational results are delivered directly to the private family Telegram group (`"feeder monitor"`):
- **Breakfast Summary**: Date, dispensed kibble count, remaining kibble count, total eaten duration.
- **Timeline & Raids**: Dan arrival timestamp, raid attempt alerts, feeder status.
- **Forensic Verification Stills**: Delivers infrared frames with YOLOv11 bounding boxes (confirming cat presence, bowl bounds, and kibble clearance).
- **System Health Heartbeat**: Validates camera synchronization, Google Drive registries, and local storage headroom.

---

## 5. Household Championship Game Rules (`v10.4-household`)

The engine derives competitive outcomes for KIBBLE RUMBLE '94 using a **decoupled two-tier architecture** separating the competitive match outcome from physical evidence verification:

### Tier 1: Competitive Game Outcome Layer
Evaluates cat movements and timeline events into deterministic game outcomes:

1. **SANBO WIN · RAID SUCCESS**:
   - Canonical TAPO `foreign_arrival` of Sanbo at Dan's feeder (Lane 1). Under household rules, Sanbo entering Dan's bowl area is sufficient for game-layer RAID SUCCESS (food presence, quantity consumed, and contested attribution are not prerequisites).
   - Recorded as `SANBO_WIN` with basis `RAID SUCCESS`.
2. **DAN WIN · DEFENDED**:
   - No Sanbo raid into Lane 1, and Dan completes his meal cleanly.
   - Recorded as `DAN_WIN` with basis `DEFENDED`. (Contested attribution belongs to the independent steward layer and does not prevent a Dan victory at the game layer).
3. **DAN COUNTER-RAID / DAN RAID (Bonus Events)**:
   - Dan visits Lane 2 (Sanbo's feeder, canonical `LOGITECH` arrival of Dan/both).
   - If Dan arrives at or after a Sanbo raid attempt ($T_{\text{Dan}} \ge T_{\text{Raid}}$), the bonus is classed as a `COUNTER RAID` (`"DAN COUNTER-RAIDED SANBO"`).
   - Otherwise, it is classed as an independent `DAN RAID` (`"DAN RAIDED SANBO"`).
4. **NO CONTEST · UNRESOLVED**:
   - Genuinely unresolved match: unfinished meal, sensor blackout, unrecorded outcome, or historical timeline lacking event data to rule a raid in or out (`result = NO_CONTEST`, `basis = UNRESOLVED`).

### Tier 2: Stewards & Evidence Verification Layer
Maintains independent forensic verification of video and sensor feeds:

- **`CLEAN MATCH`**: All camera streams and feeding events exhibit high-confidence detections and unambiguous attribution.
- **`STEWARDS REVIEW`**: Triggered when cross-camera attribution is contested, sensor occlusion occurs, or detection confidence falls below threshold.

> **Decoupled Architecture Invariant**: The competitive game outcome is decoupled from steward evidence status. For instance, a match where Sanbo enters Dan's feeder is classified as `SANBO_WIN · RAID SUCCESS` at the game layer even if attribution is flagged for `STEWARDS REVIEW`.

---

## 6. Figma Experience Design & Productization (Stage D)

To transform raw feeding telemetry into an engaging public experience, the productization layer was prototyped and defined in Figma (`Game Room v4 · Today`):

- **Design System & Visual Language**:
  - Retro 1994 Japanese arcade aesthetic (green phosphor CRT raster, neon action amber, LCD displays).
  - Custom pixel typography, authentic Japanese arcade badging, and tactile mechanical switch styling.
  - Split-lane visual balance: Lane 1 (The Arena · Dan's Bowl) vs Lane 2 (Home Base · Sanbo's Feeder).
- **NIKUKYU NK-500R Virtual CRT Chassis**:
  - Emulates a fictional 1994 Japanese Trinitron-style 14-inch color video monitor.
  - Real-time CRT scanlines, bloom shader, and barrel curvature filter.
  - Physical controls: CRT power toggle, scanline filter switch, stereo 8-bit arcade audio toggle, and cassette tape selector.
- **Head-to-Head Arcade HUD**:
  - Live match clock normalized to kibble drop ($T+MM:SS$).
  - Kibble health bar remaining gauge and feeding duration tracker.
  - Printable retro match result cards and monthly ASCII weight progression charts.

---

## 7. Privacy & Sanitization Boundary (Fail-Closed Gate)

Fair Feeder enforces a strict fail-closed privacy gate between private on-premise operations and the public presentation:

| Aspect | Private Operations (Kept Private) | Public Technical Core / KIBBLE RUMBLE |
| :--- | :--- | :--- |
| **Timing** | Exact local wall-clock times, cron triggers | **Relative match time only** ($T+00:00$ at kibble drop) |
| **Media** | Raw continuous household video archives | **Sanitized 16:9 crops**, no audio, masked backgrounds |
| **Safety** | Real surveillance feeds | **Fail-closed withholding** if any human presence detected |
| **Credentials** | RTSP passwords, service accounts, deploy keys | **None** (operational secrets omitted) |
| **Replays** | Permanent on-premise storage | **Deterministic 3+3 vault** (max 6 active replays) |
| **Health** | Private Telegram alerts, Drive registries | **Sanitized match statistics and ASCII weight histories** |

---

## 8. Continuous Data Flywheel & Improvement Loop

Rather than manually reviewing hours of footage, the system implements an active learning feedback loop to continuously refine detection accuracy:

1. **Detection Cache Auto-Flagger (`flagger.py`)**:
   - Automatically monitors the inference cache for model uncertainties and anomalies:
   - **Single-frame blips**: Isolated single-frame cat detections filtered out as transient noise.
   - **Conflicting classes**: Simultaneous competing cat detections in a single-cat bowl boundary.
   - **Kibble count jumps**: Step changes $\ge 15$ kibble pieces on clear bowl frames, indicating detection drift.
   - Low-confidence candidate frames near the detection threshold.
2. **Review Dataset Curation**:
   - Ambiguous and flagged frames are sampled into candidate review datasets.
   - Stratified curation balances night infrared frames (Tapo IR) and daytime frames (Logitech USB).
   - Enforces strict train/validation split hygiene to prevent dataset leakage.
3. **Model Retraining & Evaluation Loop**:
   - Periodic YOLOv11 fine-tuning runs incorporate difficult edge cases.
   - Validation benchmarking ensures per-class AP50 improvements without regressions.
   - Validated weights are deployed back to the edge inference runtime, closing the active learning flywheel.

---

## 9. Public Technical Core Notice & Licensing

The source code and documentation published under `fair-feeder/` represent a curated, sanitized technical core demonstrating the multi-camera computer vision models, motion buffers, and rule mechanics.

- **Curated Technical Core**: Production deployment workflows (`.github/workflows/morning-report.yml`), private scheduling, Telegram reporting bots, continuous raw surveillance video archives, and private household cloud storage are intentionally excluded.
- **Licensing Notice**: Source code and documentation are made visible in this public repository for demonstration and review only. No reuse license (such as MIT, Apache 2.0, or GPL) has been granted.

