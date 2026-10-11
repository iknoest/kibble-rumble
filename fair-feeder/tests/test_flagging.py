"""tests/test_flagging.py - Test suite for detection cache anomaly flagger."""

import pytest

from flagger import DetectionCacheFlagger


def test_flag_low_confidence_and_conflicting_cats():
    flagger = DetectionCacheFlagger(min_conf_threshold=0.40)

    frames = [
        {
            "frame_index": 1,
            "relative_time_s": 0.5,
            "detections": [
                {"class_name": "Dan", "confidence": 0.32},  # Low confidence
            ],
        },
        {
            "frame_index": 2,
            "relative_time_s": 1.0,
            "detections": [
                {"class_name": "Dan", "confidence": 0.85},
                {"class_name": "Sanbo", "confidence": 0.82},  # Conflict in single bowl ROI
            ],
        },
    ]

    flags = flagger.flag_cache(frames)
    reasons = [f.reason for f in flags]

    assert "low_confidence" in reasons
    assert "conflicting_cats" in reasons


def test_flag_single_frame_blip():
    flagger = DetectionCacheFlagger()

    frames = [
        {"frame_index": 0, "relative_time_s": 0.0, "detections": []},
        {"frame_index": 1, "relative_time_s": 0.1, "detections": [{"class_name": "Sanbo", "confidence": 0.65}]},
        {"frame_index": 2, "relative_time_s": 0.2, "detections": []},
    ]

    flags = flagger.flag_cache(frames)
    blips = [f for f in flags if f.reason == "single_frame_blip"]
    assert len(blips) == 1
    assert blips[0].class_name == "Sanbo"
    assert blips[0].frame_index == 1


def test_flag_kibble_jump_on_clear_bowl():
    flagger = DetectionCacheFlagger(kibble_jump_threshold=15)

    frames = [
        {
            "frame_index": 10,
            "relative_time_s": 5.0,
            "detections": [{"class_name": "Kibble", "confidence": 0.9}] * 40,
        },
        {
            "frame_index": 11,
            "relative_time_s": 5.5,
            # Count suddenly drops by 25 with no cat visible (false negative or detection glitch)
            "detections": [{"class_name": "Kibble", "confidence": 0.9}] * 15,
        },
    ]

    flags = flagger.flag_cache(frames)
    jumps = [f for f in flags if f.reason == "kibble_count_jump"]
    assert len(jumps) == 1
    assert jumps[0].details["diff"] == 25
