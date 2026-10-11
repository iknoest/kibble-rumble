"""tests/test_motion_detector.py - Test suite for motion detection and pre-roll buffer."""

import pytest

from motion_detector import MotionConfig, MotionTrigger, PreRollBuffer


def test_pre_roll_buffer_capacity_and_drain():
    buf = PreRollBuffer(capacity=3)
    assert len(buf) == 0

    buf.append("frame_0")
    buf.append("frame_1")
    buf.append("frame_2")
    buf.append("frame_3")  # frame_0 evicted

    assert len(buf) == 3
    assert buf.snapshot() == ["frame_1", "frame_2", "frame_3"]

    drained = buf.drain()
    assert drained == ["frame_1", "frame_2", "frame_3"]
    assert len(buf) == 0


def test_motion_trigger_state_lifecycle():
    cfg = MotionConfig(pre_buffer_frames=2, post_motion_cooldown_frames=2)
    trigger = MotionTrigger(cfg)

    # Initial state
    assert trigger.state == MotionTrigger.STATE_IDLE

    # Idle frame
    state, persist = trigger.process_frame_motion(False, "f0")
    assert state == MotionTrigger.STATE_IDLE
    assert persist is False

    # Motion starts -> transitions to RECORDING
    state, persist = trigger.process_frame_motion(True, "f1")
    assert state == MotionTrigger.STATE_RECORDING
    assert persist is True

    # Continuous motion
    state, persist = trigger.process_frame_motion(True, "f2")
    assert state == MotionTrigger.STATE_RECORDING
    assert persist is True

    # Motion stops -> enters cooldown frame 1
    state, persist = trigger.process_frame_motion(False, "f3")
    assert state == MotionTrigger.STATE_RECORDING
    assert persist is True

    # Cooldown frame 2
    state, persist = trigger.process_frame_motion(False, "f4")
    assert state == MotionTrigger.STATE_RECORDING
    assert persist is True

    # Cooldown exhausted -> transitions back to IDLE
    state, persist = trigger.process_frame_motion(False, "f5")
    assert state == MotionTrigger.STATE_IDLE
    assert persist is False
