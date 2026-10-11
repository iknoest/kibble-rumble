"""fair-feeder/src/flagging.py - Continuous model quality auto-flagging engine.

Inspects raw detection caches to flag anomalies for Roboflow active learning
and model fine-tuning without manual frame-by-frame inspection.

Flagging rules:
1. Single-frame blips: isolated detections that appear for only 1 frame.
2. Low-confidence detections in key interaction zones.
3. Conflicting classes: simultaneous competing cat detections in a single-cat bowl zone.
4. Kibble count jumps: count changes >= threshold on clear bowl frames.
"""

from __future__ import annotations

from dataclasses import dataclass
from typing import Any, Dict, List, Optional, Set


@dataclass
class FlaggedFrame:
    """Anomalous detection event flagged for active learning review."""

    frame_index: int
    relative_time_s: float
    reason: str
    class_name: str
    confidence: float
    details: Dict[str, Any]


class DetectionCacheFlagger:
    """Analyzes detection cache to identify candidate frames for dataset improvement."""

    def __init__(
        self,
        min_conf_threshold: float = 0.35,
        kibble_jump_threshold: int = 15,
    ) -> None:
        self.min_conf_threshold = min_conf_threshold
        self.kibble_jump_threshold = kibble_jump_threshold

    def flag_cache(self, frames: List[Dict[str, Any]]) -> List[FlaggedFrame]:
        """Runs all anomaly detectors across a chronological detection sequence."""
        flagged: List[FlaggedFrame] = []
        if not frames:
            return flagged

        # 1. Low confidence & Conflicting classes
        for f in frames:
            f_idx = f.get("frame_index", 0)
            t_s = float(f.get("relative_time_s", 0.0))
            detections = f.get("detections", [])

            cat_classes: Set[str] = set()
            for d in detections:
                c_name = d.get("class_name", "")
                conf = float(d.get("confidence", 0.0))

                # Check low confidence on cat detections
                if c_name in ("Dan", "Sanbo") and conf < self.min_conf_threshold:
                    flagged.append(
                        FlaggedFrame(
                            frame_index=f_idx,
                            relative_time_s=t_s,
                            reason="low_confidence",
                            class_name=c_name,
                            confidence=conf,
                            details={"threshold": self.min_conf_threshold},
                        )
                    )

                if c_name in ("Dan", "Sanbo"):
                    cat_classes.add(c_name)

            # Check conflicting classes
            if "Dan" in cat_classes and "Sanbo" in cat_classes:
                flagged.append(
                    FlaggedFrame(
                        frame_index=f_idx,
                        relative_time_s=t_s,
                        reason="conflicting_cats",
                        class_name="Dan+Sanbo",
                        confidence=1.0,
                        details={"classes": sorted(list(cat_classes))},
                    )
                )

        # 2. Single-frame blips (1 frame of Dan or Sanbo with none before and none after)
        for i in range(1, len(frames) - 1):
            prev_cats = {d.get("class_name") for d in frames[i - 1].get("detections", [])}
            curr_cats = {d.get("class_name") for d in frames[i].get("detections", [])}
            next_cats = {d.get("class_name") for d in frames[i + 1].get("detections", [])}

            for cat in ("Dan", "Sanbo"):
                if cat in curr_cats and cat not in prev_cats and cat not in next_cats:
                    curr_d = next(d for d in frames[i]["detections"] if d.get("class_name") == cat)
                    flagged.append(
                        FlaggedFrame(
                            frame_index=frames[i].get("frame_index", 0),
                            relative_time_s=float(frames[i].get("relative_time_s", 0.0)),
                            reason="single_frame_blip",
                            class_name=cat,
                            confidence=float(curr_d.get("confidence", 0.0)),
                            details={"window": [-1, 0, 1]},
                        )
                    )

        # 3. Kibble jumps (only compared when bowl is clear of cats)
        clear_bowl_frames = [
            f for f in frames
            if not any(d.get("class_name") in ("Dan", "Sanbo") for d in f.get("detections", []))
        ]

        for i in range(1, len(clear_bowl_frames)):
            prev_kibble = sum(1 for d in clear_bowl_frames[i - 1].get("detections", []) if d.get("class_name") == "Kibble")
            curr_kibble = sum(1 for d in clear_bowl_frames[i].get("detections", []) if d.get("class_name") == "Kibble")
            diff = abs(curr_kibble - prev_kibble)

            if diff >= self.kibble_jump_threshold:
                flagged.append(
                    FlaggedFrame(
                        frame_index=clear_bowl_frames[i].get("frame_index", 0),
                        relative_time_s=float(clear_bowl_frames[i].get("relative_time_s", 0.0)),
                        reason="kibble_count_jump",
                        class_name="Kibble",
                        confidence=1.0,
                        details={"prev_count": prev_kibble, "curr_count": curr_kibble, "diff": diff},
                    )
                )

        return flagged
