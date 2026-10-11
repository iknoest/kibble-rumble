"""fair-feeder/src/models.py - Core data models and schemas for Fair Feeder.

Provides structured domain representations for:
- Object detections and spatial bounding boxes.
- Multi-lane feeder configurations (Lane 1 Tapo vs Lane 2 Logitech).
- Cat profiles, dynamic age derivation from date of birth, and weight tracking.
- Feeding event streams and temporal state tracking.
"""

from __future__ import annotations

from dataclasses import dataclass, field
from datetime import date
from typing import Any, Dict, List, Optional, Tuple


@dataclass(frozen=True)
class BoundingBox:
    """Normalized or pixel coordinate bounding box."""

    x1: float
    y1: float
    x2: float
    y2: float

    @property
    def width(self) -> float:
        return max(0.0, self.x2 - self.x1)

    @property
    def height(self) -> float:
        return max(0.0, self.y2 - self.y1)

    @property
    def area(self) -> float:
        return self.width * self.height

    def iou(self, other: BoundingBox) -> float:
        """Computes Intersection over Union with another bounding box."""
        ix1 = max(self.x1, other.x1)
        iy1 = max(self.y1, other.y1)
        ix2 = min(self.x2, other.x2)
        iy2 = min(self.y2, other.y2)

        iw = max(0.0, ix2 - ix1)
        ih = max(0.0, iy2 - iy1)
        intersection = iw * ih

        union = self.area + other.area - intersection
        if union <= 0.0:
            return 0.0
        return intersection / union


@dataclass
class Detection:
    """Single object detection instance from vision model."""

    class_name: str
    confidence: float
    box: BoundingBox
    frame_index: int = 0
    relative_time_s: float = 0.0

    def to_dict(self) -> Dict[str, Any]:
        return {
            "class_name": self.class_name,
            "confidence": round(self.confidence, 4),
            "box": {
                "x1": round(self.box.x1, 2),
                "y1": round(self.box.y1, 2),
                "x2": round(self.box.x2, 2),
                "y2": round(self.box.y2, 2),
            },
            "frame_index": self.frame_index,
            "relative_time_s": round(self.relative_time_s, 2),
        }


@dataclass
class FeederLane:
    """Physical feeding lane and camera pairing."""

    lane_id: str
    camera_id: str
    primary_cat: str
    description: str

    def is_primary(self, cat_name: str) -> bool:
        return self.primary_cat.lower() == cat_name.lower()


@dataclass
class WeightRecord:
    """Authoritative physical weight observation."""

    measured_date: date
    weight_kg: float
    notes: Optional[str] = None


@dataclass
class CatProfile:
    """Cat profile with date of birth and weight history tracking."""

    cat_id: str
    name: str
    breed: str
    date_of_birth: date
    weight_history: List[WeightRecord] = field(default_factory=list)

    def calculate_age_years(self, as_of: Optional[date] = None) -> int:
        """Derives exact completed age in years dynamically from date of birth.

        Never hardcodes static age integers. Increments on birth date.
        """
        ref_date = as_of or date.today()
        years = ref_date.year - self.date_of_birth.year
        if (ref_date.month, ref_date.day) < (self.date_of_birth.month, self.date_of_birth.day):
            years -= 1
        return max(0, years)

    def get_latest_weight(self) -> Optional[Tuple[float, date]]:
        """Returns the most recent verified weight measurement (kg, date)."""
        if not self.weight_history:
            return None
        sorted_records = sorted(self.weight_history, key=lambda r: r.measured_date, reverse=True)
        latest = sorted_records[0]
        return latest.weight_kg, latest.measured_date

    def get_weight_trend(self) -> str:
        """Determines weight trajectory across recent measurements without averaging."""
        if len(self.weight_history) < 2:
            return "stable"
        sorted_records = sorted(self.weight_history, key=lambda r: r.measured_date, reverse=True)
        curr = sorted_records[0].weight_kg
        prev = sorted_records[1].weight_kg
        delta = curr - prev
        if delta >= 0.15:
            return "gaining"
        if delta <= -0.15:
            return "losing"
        return "stable"


@dataclass
class FeedingEvent:
    """Canonical discrete feeding event on relative timeline."""

    event_type: str  # food_dispensed, cat_arrival, foreign_arrival, meal_finish
    camera: str  # TAPO (Lane 1) or LOGITECH (Lane 2)
    cat: str  # Dan, Sanbo, or none
    relative_time_s: int
    confidence: float = 1.0
    kibble_count: Optional[int] = None
    metadata: Dict[str, Any] = field(default_factory=dict)

    @property
    def formatted_relative_time(self) -> str:
        """Formats relative seconds into T+mm:ss notation."""
        if self.relative_time_s < 0:
            return "PRE-MATCH"
        m = self.relative_time_s // 60
        s = self.relative_time_s % 60
        return f"T+{m:02d}:{s:02d}"

    def to_dict(self) -> Dict[str, Any]:
        return {
            "type": self.event_type,
            "camera": self.camera,
            "cat": self.cat,
            "t_s": self.relative_time_s,
            "rel_time": self.formatted_relative_time,
            "confidence": round(self.confidence, 4),
            "kibble_count": self.kibble_count,
            "metadata": self.metadata,
        }
