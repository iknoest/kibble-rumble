# Fair Feeder Core

> **The computer-vision feeding-monitor engine behind [KIBBLE RUMBLE '94](https://iknoest.github.io/kibble-rumble/).**

Fair Feeder monitors cat feeding activity across dual automated feeding stations, extracts discrete feeding events using computer vision (YOLOv11), resolves cross-camera feeding attribution, and projects sanitized match telemetry into an interactive retro arcade experience.

---

## Overview

In multi-cat households with automated feeders, supervising meal distribution poses unique challenges:
- Did the designated cat eat their full portion?
- Did a fast-eating companion cat steal food from the other feeder?
- Were portions dispensed reliably?

Fair Feeder answers these questions automatically through multi-camera vision analysis while preserving privacy.

---

## How It Works

```
[ Dual Cameras (Tapo IR + Logitech USB) ]
                   │
                   ▼
[ Edge Motion Detection & Ring Buffer (Raspberry Pi) ]
                   │
                   ▼
[ YOLOv11 Multi-Class Object Detection ]
                   │
                   ▼
[ Event Timeline & Game Rule Engine ]
                   │
                   ▼
[ Privacy-Safe Public Projection Gate ]
                   │
                   ▼
[ KIBBLE RUMBLE '94 Arcade Site (GitHub Pages) ]
```

1. **Two-Feeder Surveillance**: Monitors Lane 1 (Dan's feeder) and Lane 2 (Sanbo's feeder) using independent cameras.
2. **Edge Motion Trigger**: Uses MOG2 background subtraction with circular pre-roll buffers to preserve pre-trigger arrival motion lead time.
3. **Computer Vision Inference**: Employs a custom YOLOv11 model detecting `Dan`, `Sanbo`, `Dan_hand`, `Bowl`, and `Kibble`.
4. **Championship Game Rules**: Resolves feeding sessions into competitive match outcomes (`DAN_WIN · DEFENDED`, `SANBO_WIN · RAID SUCCESS`, or `DAN COUNTER-RAID`).
5. **Privacy Projection**: Strips wall-clock times, removes audio streams, masks non-feeder backgrounds, and enforces fail-closed human privacy withholding.

For a detailed technical breakdown, see [`architecture.md`](architecture.md).

---

## Directory Structure

```
fair-feeder/
  README.md                 # Project overview and public core guide
  architecture.md           # In-depth system architecture and pipeline design
  src/
    models.py               # Domain schemas: detections, feeder lanes, cat profiles, events
    motion_detector.py      # Portable edge motion trigger and circular pre-roll ring buffer
    flagger.py              # Active learning anomaly auto-flagger (blips, kibble jumps, conflicts)
    rule_engine.py          # Championship game rule engine (v10.4-household)
    privacy.py              # Public projection transforms and Person Safety withholding
  examples/
    sanitized_report.json   # Synthetic complete feeding match report fixture
    event_timeline.json     # Synthetic sequential relative event timeline
  tests/
    test_models.py          # Unit tests for domain models and dynamic age calculation
    test_motion_detector.py # Unit tests for motion state machine and ring buffer
    test_flagging.py        # Unit tests for anomaly detection algorithms
    test_rule_engine.py     # Unit tests for household game rules and bonus events
    test_privacy.py         # Unit tests for Person Safety rule and 3+3 vault retention
```

---

## Public Scope vs Private Operations

To protect household privacy and infrastructure security, this repository contains only the clean, reusable technical engine:

### What Is Included in This Public Core
- Domain data models and event schemas.
- Portable MOG2 motion trigger and circular buffer mechanics.
- Anomaly auto-flagging algorithms for continuous model improvement.
- Championship game outcome derivation and steward rules.
- Privacy projection transforms and Person Safety evaluation logic.
- Synthetic examples and self-contained test suites.

### What Remains Private
- Production workflow automation and scheduling configuration.
- Continuous household video recordings and raw unmasked camera archives.
- Household network identifiers, LAN IP addresses, and camera credentials.
- Cloud storage folder identifiers and authentication tokens.
- Private communication channels and delivery ledgers.

---

## Running the Tests

The public test suite runs on synthetic fixtures without external hardware or cloud dependencies:

```bash
# Run tests using pytest
pytest fair-feeder/tests/
```

---

## Relationship to KIBBLE RUMBLE '94

- 🕹️ **[KIBBLE RUMBLE '94](https://iknoest.github.io/kibble-rumble/)**: The public retro arcade web application running on GitHub Pages.
- 🐾 **Fair Feeder Core**: The computer-vision pipeline, event modeling, and privacy projection engine documented here.

---

## License

Source available for viewing; no reuse license has been granted.
