"""fair-feeder/src/privacy.py - Privacy-safe public projection and sanitization transforms.

Core privacy guarantees:
1. Relative timing: Converts all times to relative match offsets (T+00:00 at kibble drop).
   No wall-clock timestamps are ever exported.
2. Person Safety Rule: Fail-closed withholding of replay footage whenever human presence
   or manual bowl intervention (Dan_hand) is detected.
3. Replay Vault retention: Deterministic policy retaining at most 3 Dan wins + 3 Sanbo wins
   (max 6 active videos), aging older media while retaining historical game metadata.
"""

from __future__ import annotations

from typing import Any, Dict, List, Set


MAX_REPLAY_PER_CAT = 3
MAX_REPLAY_TOTAL = 6


def format_relative_time(seconds: int) -> str:
    """Formats relative seconds into T+mm:ss format, or PRE-MATCH if negative."""
    if seconds < 0:
        return "PRE-MATCH"
    m = seconds // 60
    s = seconds % 60
    return f"T+{m:02d}:{s:02d}"


def evaluate_person_safety(
    detections: List[Dict[str, Any]],
    human_classes: Set[str] = {"Dan_hand", "person"},
) -> bool:
    """Evaluates whether raw media contains human presence.

    Returns True if frame/session is SAFE for public display, False if human presence detected.
    Fails closed: any appearance of human classes withholds media.
    """
    for det in detections:
        c_name = str(det.get("class_name", ""))
        if c_name in human_classes:
            return False
    return True


def compute_replay_retention(
    matches: List[Dict[str, Any]],
    available_media_ids: Set[str],
) -> Dict[str, str]:
    """Computes retention statuses for replays across all matches.

    Possible statuses:
    - retained: Active in Replay Vault (within 3+3 quota).
    - aged: Valid historical win whose video has rolled out of the 3+3 quota.
    - withheld: Withheld by Person Safety rule or privacy flag.
    - not_available: Match had no video available originally.
    - none: Match was NO CONTEST (does not qualify for championship vault).
    """
    statuses: Dict[str, str] = {}

    for m in matches:
        mid = m["match_id"]
        res = m.get("result", "")
        withheld = bool(m.get("replay_withheld", False))

        if withheld:
            statuses[mid] = "withheld"
        elif mid not in available_media_ids:
            statuses[mid] = "not_available"
        elif res not in ("DAN_WIN", "SANBO_WIN"):
            statuses[mid] = "none"
        else:
            statuses[mid] = "pending"

    # Select latest Dan wins up to quota
    dan_wins = [
        m for m in matches
        if m.get("result") == "DAN_WIN" and statuses[m["match_id"]] == "pending"
    ]
    dan_wins.sort(key=lambda m: m.get("date") or m["match_id"], reverse=True)
    retained_dan = {m["match_id"] for m in dan_wins[:MAX_REPLAY_PER_CAT]}

    # Select latest Sanbo wins up to quota
    sanbo_wins = [
        m for m in matches
        if m.get("result") == "SANBO_WIN" and statuses[m["match_id"]] == "pending"
    ]
    sanbo_wins.sort(key=lambda m: m.get("date") or m["match_id"], reverse=True)
    retained_sanbo = {m["match_id"] for m in sanbo_wins[:MAX_REPLAY_PER_CAT]}

    for m in matches:
        mid = m["match_id"]
        if statuses[mid] == "pending":
            if mid in retained_dan or mid in retained_sanbo:
                statuses[mid] = "retained"
            else:
                statuses[mid] = "aged"

    return statuses
