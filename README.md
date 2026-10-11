# KIBBLE RUMBLE '94

> **A retro 1994 arcade replay machine and daily cat feeding championship for Dan and Sanbo.**

🕹️ **[Play Live Demo](https://iknoest.github.io/kibble-rumble/)**

![KIBBLE RUMBLE '94 Champion Select](assets/og-preview.png)

## What is this?

**KIBBLE RUMBLE '94** turns daily morning breakfast into an interactive retro arcade experience. Powered by computer-vision detection and automated feeding analysis, each morning's feeding session becomes a playable arcade tape on the fictional **NIKUKYU NK-500R** color video monitor.

## The Contestants

- 🥊 **Dan (P1)**: 5-year-old Tuxedo cat. Defending champion at Dan's bowl.
- 😼 **Sanbo (P2)**: 1-year-old Calico cat. Challenger and contender.

## Championship Rules

- **Dan Win · Defended**: Sanbo never enters Dan's bowl area, and Dan successfully clears his breakfast.
- **Sanbo Win · Raid Success**: Sanbo enters Dan's bowl area and eats Dan's kibble.
- **Dan Counter-Raid**: If Dan visits Sanbo's feeder while Sanbo is elsewhere.
- **No Contest / Void**: Unresolved attribution or interrupted match.

## How It Works

```
[ Automated Feeder & Cameras ]
             │
             ▼
[ Computer-Vision Detection (YOLO) ]
             │
             ▼
[ Event Timeline & Game Logic ]
             │
             ▼
[ Privacy Sanitization & Projection ]
             │
             ▼
[ KIBBLE RUMBLE '94 Arcade Site (GitHub Pages) ]
```

1. **Daily Feeding**: Automated cameras record breakfast activity at Dan and Sanbo's feeders.
2. **Vision Analysis**: Object detection tracks bowl states, kibble counts, and cat movements.
3. **Daily Replay Tape**: Every morning generates a new arcade tape with key match moments (Kibble Drop, Arrivals, Raids, Bowl Cleared).
4. **Replay Vault**: Retains a rolling 30-day index and a curated vault of the best Dan defenses and Sanbo raids.

## Privacy & Sanitization

All public media published to this repository is automatically sanitized:
- **Relative Match Time**: Household wall-clock times are replaced with relative game time ($T+00:00 = \text{Kibble Drop}$).
- **Privacy Masking**: Household backgrounds and absolute timestamps are masked.
- **Single-Camera Framing**: Evidence stills and replays isolate the feeding area in clean 16:9 crops.
- **No Audio**: Surveillance audio is completely stripped from public replay clips.

---

*Powered by Fair Feeder · Hosted on GitHub Pages · Zero paid infrastructure*
