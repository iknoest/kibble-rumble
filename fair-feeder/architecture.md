# Fair Feeder Architecture & Technical Design

Fair Feeder is an automated computer-vision monitoring engine designed to supervise daily cat feeding across multiple feeding stations. It extracts discrete feeding events from video streams, tracks kibble consumption, resolves cross-camera feeding attribution, and projects sanitized match telemetry into [KIBBLE RUMBLE '94](https://iknoest.github.io/kibble-rumble/).

---

## 1. System Topology

![Fair Feeder System Architecture](../assets/architecture-diagram.png)

```
+-------------------------------------------------------------------------------+
|                                EDGE RUNTIME (LAN)                             |
|                                                                               |
|  [Tapo C210 IR] (Lane 1)  --RTSP/TCP-->  [Motion Recorder Daemon (Pi 5)]      |
|  [Logitech USB] (Lane 2)  --V4L2/USB-->  * MOG2 Motion Detection              |
|                                          * Pre-roll Circular Ring Buffer      |
|                                          * Video Capture & Sync Storage       |
+-------------------------------------------------------------------------------+
                                        │
                                        ▼
+-------------------------------------------------------------------------------+
|                           CV & ANALYTICS PIPELINE                             |
|                                                                               |
|  * YOLOv11 Object Detection (Classes: Dan, Sanbo, Dan_hand, Bowl, Kibble)     |
|  * Temporal Tracking & Discrete Event Extraction                              |
|  * Continuous Active Learning & Anomaly Auto-Flagging                         |
|  * Championship Rule Engine (Household v10.4 Outcome Derivation)              |
+-------------------------------------------------------------------------------+
                                        │
                                        ▼
+-------------------------------------------------------------------------------+
|                      PRIVACY-SAFE PUBLIC PROJECTION GATE                      |
|                                                                               |
|  * Wall-Clock -> Relative Match Time Offset (T+00:00 = Kibble Drop)           |
|  * Fail-Closed Person Safety Rule (Withholds Media if Human Presence Detected)|
|  * 16:9 Single-Lane Crop Framing & Background Privacy Masking                 |
|  * Surveillance Audio Removal                                                 |
|  * Replay Vault Deterministic Retention (Top 3 Dan Wins + Top 3 Sanbo Wins)   |
+-------------------------------------------------------------------------------+
                                        │
                                        ▼
+-------------------------------------------------------------------------------+
|                       PUBLIC PRESENTATION & REPLAY                            |
|                                                                               |
|  [KIBBLE RUMBLE '94 Arcade Site (GitHub Pages)]                               |
|  * NIKUKYU NK-500R Interactive CRT Emulator                                   |
|  * Verified Match Memories & ASCII Weight Records                             |
+-------------------------------------------------------------------------------+
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

## 3. Computer Vision & Event Extraction

### Vision Model
The detection core uses a custom-trained **YOLOv11** model with 5 domain classes:
1. `Dan`: Tuxedo cat (black & white coat, white chest/paws).
2. `Sanbo`: Calico cat (tricolor calico pattern, agile build).
3. `Dan_hand`: Human hand/arm during manual feeder maintenance (trigger for Person Safety withholding).
4. `Bowl`: Feeding dish boundary.
5. `Kibble`: Individual dry food pieces.

All inference runs at native 16:9 aspect ratio (`rect=True`) to avoid bounding box distortion.

### Event Extraction Engine
From raw frame-by-frame detections, the engine derives discrete timeline events:
- `food_dispensed`: Kibble released into bowl. Defines time zero ($T+00:00$).
- `cat_arrival`: Primary cat arrives at their home feeder.
- `foreign_arrival`: Cat detected visiting the *other* cat's feeder (cross-feeder raid event).
- `meal_finish`: Bowl cleared and cat departs.

---

## 4. Household Championship Game Rules (`v10.4-household`)

The engine derives competitive outcomes for KIBBLE RUMBLE '94 using a **decoupled two-tier architecture** separating the competitive match outcome from physical evidence verification:

### Tier 1: Competitive Game Outcome Layer
Evaluates cat movements and timeline events into deterministic game outcomes:

1. **SANBO WIN · RAID SUCCESS**:
   - Sanbo crosses over to Lane 1 (Dan's feeder) and enters the bowl area while food is present (`TAPO` `foreign_arrival` or `cat_arrival`).
   - Recorded as `SANBO_WIN` with basis `RAID SUCCESS`.
2. **DAN WIN · DEFENDED**:
   - Sanbo never enters Lane 1, and Dan completes his meal cleanly without contested attribution.
   - Recorded as `DAN_WIN` with basis `DEFENDED`.
3. **DAN COUNTER-RAID / DAN RAID (Bonus Events)**:
   - Dan visits Lane 2 (Sanbo's feeder, `LOGITECH` arrival).
   - If Dan arrives at or after a Sanbo raid attempt ($T_{\text{Dan}} \ge T_{\text{Raid}}$), the bonus is classed as a `COUNTER RAID` (`"DAN COUNTER-RAIDED SANBO"`).
   - Otherwise, it is classed as an independent `DAN RAID` (`"DAN RAIDED SANBO"`).
4. **NO CONTEST · UNRESOLVED**:
   - Incomplete meal, sensory blackout, or unresolved match void (`result = NO_CONTEST`, `basis = UNRESOLVED`).

### Tier 2: Stewards & Evidence Verification Layer
Maintains independent forensic verification of video and sensor feeds:

- **`CLEAN MATCH`**: All camera streams and feeding events exhibit high-confidence detections and unambiguous attribution.
- **`STEWARDS REVIEW`**: Triggered when cross-camera attribution is contested, sensor occlusion occurs, or detection confidence falls below threshold.

> **Decoupled Architecture Invariant**: The competitive game outcome is decoupled from steward evidence status. For instance, a match where Sanbo enters Dan's feeder is classified as `SANBO_WIN · RAID SUCCESS` at the game layer even if attribution is flagged for `STEWARDS REVIEW`.

---

## 5. Privacy & Sanitization Boundary

Fair Feeder enforces a strict privacy gate between private on-premise operations and the public presentation:

| Aspect | Private Operations (Kept Private) | Public Technical Core / KIBBLE RUMBLE |
| :--- | :--- | :--- |
| **Timing** | Exact local wall-clock times, cron triggers | **Relative match time only** ($T+00:00$ at kibble drop) |
| **Media** | Raw continuous household video archives | **Sanitized 16:9 crops**, no audio, masked backgrounds |
| **Safety** | Real surveillance feeds | **Fail-closed withholding** if any human presence detected |
| **Credentials** | RTSP passwords, service accounts, deploy keys | **None** (zero operational secrets) |
| **Replays** | Permanent on-premise storage | **Deterministic 3+3 vault** (max 6 active replays) |
| **Health** | Private Telegram alerts, Drive registries | **Sanitized match statistics and ASCII weight histories** |

---

## 6. Continuous Data Flywheel

Rather than manually reviewing hours of footage, the engine auto-flags candidate frames directly from the detection cache:
- **Single-frame blips**: Isolated single-frame cat detections filtered out as noise.
- **Conflicting classes**: Simultaneous competing cat detections in a single-cat bowl box.
- **Kibble count jumps**: Step changes $\ge 15$ kibble on clear bowl frames, indicating detection drift.

Flagged frames feed directly into the retraining pipeline, creating a closed-loop improvement flywheel for model accuracy.

---

## 7. Public Technical Core Notice & Licensing

The source code and documentation published under `fair-feeder/` represent a curated, sanitized technical core demonstrating the multi-camera computer vision models, motion buffers, and rule mechanics.

- **Curated Technical Core**: Production deployment workflows (`.github/workflows/morning-report.yml`), private scheduling, Telegram reporting bots, continuous raw surveillance video archives, and private household cloud storage are intentionally excluded.
- **Licensing Notice**: Source code and documentation are made visible in this public repository for demonstration and review only. No reuse license (such as MIT, Apache 2.0, or GPL) has been granted.

