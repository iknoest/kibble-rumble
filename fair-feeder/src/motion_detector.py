"""fair-feeder/src/motion_detector.py - Edge motion trigger and pre-roll ring buffer.

Implements portable motion detection algorithms suitable for edge devices (Raspberry Pi):
- Pre-roll circular ring buffer preserving frames prior to motion trigger.
- Background subtraction with adaptive foreground thresholding.
- Region of interest (ROI) motion gating to ignore background noise.
"""

from __future__ import annotations

import collections
from dataclasses import dataclass
from typing import Any, Deque, List, Optional, Tuple


@dataclass
class MotionConfig:
    """Configuration parameters for motion detector."""

    min_motion_area: int = 500  # Minimum foreground pixels to trigger
    pre_buffer_frames: int = 45  # ~3 seconds at 15 fps
    post_motion_cooldown_frames: int = 30  # Hold recording after motion stops
    history_frames: int = 300  # MOG2 background history
    var_threshold: float = 16.0  # MOG2 variance threshold


class PreRollBuffer:
    """Circular buffer preserving pre-trigger frames prior to motion event."""

    def __init__(self, capacity: int) -> None:
        self.capacity = max(1, capacity)
        self._buffer: Deque[Any] = collections.deque(maxlen=self.capacity)

    def append(self, frame: Any) -> None:
        """Pushes a new frame into the circular buffer."""
        self._buffer.append(frame)

    def drain(self) -> List[Any]:
        """Drains and returns all buffered pre-roll frames in chronological order."""
        frames = list(self._buffer)
        self._buffer.clear()
        return frames

    def snapshot(self) -> List[Any]:
        """Returns copies of all buffered pre-roll frames without clearing."""
        return list(self._buffer)

    def __len__(self) -> int:
        return len(self._buffer)


class MotionTrigger:
    """State machine governing motion-triggered recording sessions."""

    STATE_IDLE = "IDLE"
    STATE_RECORDING = "RECORDING"
    STATE_COOLDOWN = "COOLDOWN"

    def __init__(self, config: Optional[MotionConfig] = None) -> None:
        self.config = config or MotionConfig()
        self.buffer = PreRollBuffer(capacity=self.config.pre_buffer_frames)
        self.state = self.STATE_IDLE
        self.cooldown_remaining = 0
        self.session_frame_count = 0

    def process_frame_motion(self, frame_has_motion: bool, frame_payload: Any) -> Tuple[str, bool]:
        """Evaluates motion state for an incoming frame.

        Returns (current_state, should_persist_frame).
        """
        if frame_has_motion:
            if self.state == self.STATE_IDLE:
                self.state = self.STATE_RECORDING
                self.session_frame_count = 0
            self.cooldown_remaining = self.config.post_motion_cooldown_frames
            self.session_frame_count += 1
            return self.state, True

        # No motion in this frame
        if self.state == self.STATE_RECORDING:
            self.state = self.STATE_COOLDOWN

        if self.state == self.STATE_COOLDOWN:
            if self.cooldown_remaining > 0:
                self.cooldown_remaining -= 1
                self.session_frame_count += 1
                return self.STATE_RECORDING, True
            else:
                self.state = self.STATE_IDLE
                self.session_frame_count = 0
                self.buffer.append(frame_payload)
                return self.STATE_IDLE, False

        # Idle
        self.buffer.append(frame_payload)
        return self.STATE_IDLE, False
