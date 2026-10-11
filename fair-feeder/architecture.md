# Fair Feeder Architecture & Technical Design

Fair Feeder is an automated computer-vision monitoring engine designed to supervise daily cat feeding across multiple feeding stations. It extracts discrete feeding events from video streams, tracks kibble consumption, resolves cross-camera feeding attribution, and projects sanitized match telemetry into [KIBBLE RUMBLE '94](https://iknoest.github.io/kibble-rumble/).

---

## 1. System Topology

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

The engine derives competitive outcomes for KIBBLE RUMBLE '94 using the following deterministic state transitions:

1. **SANBO WIN · RAID SUCCESS**:
   - Sanbo crosses over to Lane 1 (Dan's feeder) and enters the bowl area while food is present (`TAPO` `foreign_arrival`).
2. **DAN WIN · DEFENDED**:
   - Sanbo never enters Lane 1, and Dan finishes his meal cleanly.
3. **DAN COUNTER-RAID (Bonus Event)**:
   - Dan visits Lane 2 (Sanbo's feeder, `LOGITECH` arrival). If this occurs after a Sanbo raid attempt, it is classed as a `COUNTER RAID`; otherwise, a `DAN RAID`.
4. **NO CONTEST · UNRESOLVED**:
   - Meal unfinished, sensory occlusion, or attribution conflict between cameras (`STEWARDS REVIEW`).

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
