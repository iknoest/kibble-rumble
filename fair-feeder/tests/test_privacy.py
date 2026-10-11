"""tests/test_privacy.py - Test suite for privacy transforms and projection rules."""

import pytest

from privacy import (
    compute_replay_retention,
    evaluate_person_safety,
    format_relative_time,
)


def test_format_relative_time():
    assert format_relative_time(-5) == "PRE-MATCH"
    assert format_relative_time(0) == "T+00:00"
    assert format_relative_time(45) == "T+00:45"
    assert format_relative_time(75) == "T+01:15"
    assert format_relative_time(360) == "T+06:00"


def test_evaluate_person_safety_fails_closed():
    # Safe detections (cats, bowls, kibble)
    safe_detections = [
        {"class_name": "Dan", "confidence": 0.95},
        {"class_name": "Bowl", "confidence": 0.98},
        {"class_name": "Kibble", "confidence": 0.90},
    ]
    assert evaluate_person_safety(safe_detections) is True

    # Dan_hand detected -> person safety fails closed
    hand_detections = [
        {"class_name": "Dan", "confidence": 0.95},
        {"class_name": "Dan_hand", "confidence": 0.88},
    ]
    assert evaluate_person_safety(hand_detections) is False

    # Person detected -> person safety fails closed
    person_detections = [
        {"class_name": "person", "confidence": 0.75},
    ]
    assert evaluate_person_safety(person_detections) is False


def test_replay_vault_retention_deterministic_policy():
    matches = [
        {"match_id": "2026-10-11", "result": "SANBO_WIN", "replay_withheld": False},
        {"match_id": "2026-10-10", "result": "DAN_WIN", "replay_withheld": True},   # Withheld by safety
        {"match_id": "2026-10-09", "result": "DAN_WIN", "replay_withheld": False},
        {"match_id": "2026-10-08", "result": "SANBO_WIN", "replay_withheld": False},
        {"match_id": "2026-10-07", "result": "NO_CONTEST", "replay_withheld": False},
        {"match_id": "2026-10-06", "result": "DAN_WIN", "replay_withheld": False},
        {"match_id": "2026-10-05", "result": "DAN_WIN", "replay_withheld": False},
        {"match_id": "2026-10-04", "result": "DAN_WIN", "replay_withheld": False},   # Excess Dan win -> aged
        {"match_id": "2026-10-03", "result": "SANBO_WIN", "replay_withheld": False},
        {"match_id": "2026-10-02", "result": "SANBO_WIN", "replay_withheld": False}, # Excess Sanbo win -> aged
    ]

    available = {m["match_id"] for m in matches}
    retention = compute_replay_retention(matches, available)

    # Sanbo wins: top 3 retained
    assert retention["2026-10-11"] == "retained"
    assert retention["2026-10-08"] == "retained"
    assert retention["2026-10-03"] == "retained"
    assert retention["2026-10-02"] == "aged"

    # Dan wins: top 3 retained (skipping withheld)
    assert retention["2026-10-10"] == "withheld"
    assert retention["2026-10-09"] == "retained"
    assert retention["2026-10-06"] == "retained"
    assert retention["2026-10-05"] == "retained"
    assert retention["2026-10-04"] == "aged"

    # NO CONTEST earns no slot
    assert retention["2026-10-07"] == "none"
