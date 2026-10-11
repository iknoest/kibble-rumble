# KIBBLE RUMBLE '94

A computer-vision cat feeding monitor and retro championship replay machine for Dan and Sanbo.

## About

Kibble Rumble '94 transforms daily breakfast footage captured by the Fair Feeder monitor into an interactive 1994 arcade replay experience.

- **Dan**: Tuxedo cat, defending champion at Dan's bowl
- **Sanbo**: Calico cat, challenger and contender

## System Architecture

Footage is monitored, verified, and sanitized before publication:
- All household timestamps are converted to relative match time ($T+00:00 = \text{Kibble Drop}$)
- Household background and private cameras are masked or omitted
- Preserves rolling 30-day match tapes and a bounded Replay Vault
- Zero paid hosting: served via GitHub Pages
