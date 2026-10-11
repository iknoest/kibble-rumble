"""fair-feeder/src/rule_engine.py - Championship game rule and outcome derivation.

Implements the canonical household game rules (rule ID: v10.4-household):
- SANBO WIN · RAID SUCCESS: Sanbo entered Dan's feeder (TAPO foreign_arrival).
- DAN WIN · DEFENDED: Sanbo never entered Dan's feeder and Dan finished his meal.
- DAN COUNTER-RAID: Dan sneaks over to Sanbo's feeder (LOGITECH foreign/cat arrival).
- NO CONTEST: Unresolved sensory conflict, interrupted feeding, or incomplete meal.
"""

from __future__ import annotations

from dataclasses import dataclass
from typing import Any, Dict, List, Optional

try:
    from .models import FeedingEvent
except ImportError:
    from models import FeedingEvent


@dataclass
class BonusEvent:
    """Bonus game event (e.g. Dan counter-raiding Sanbo's bowl)."""

    kind: str  # COUNTER RAID or DAN RAID
    label: str
    camera: str
    relative_time_s: int


@dataclass
class GameOutcome:
    """Canonical resolved match outcome."""

    result: str  # DAN_WIN, SANBO_WIN, or NO_CONTEST
    winner: Optional[str]  # Dan, Sanbo, or None
    basis: str  # DEFENDED, RAID SUCCESS, or UNRESOLVED
    rule_id: str  # v10.4-household
    meal_finished: bool
    stewards: str  # CLEAN MATCH or STEWARDS REVIEW
    stewards_detail: str
    bonus: Optional[BonusEvent] = None

    def to_dict(self) -> Dict[str, Any]:
        return {
            "result": self.result,
            "winner": self.winner,
            "basis": self.basis,
            "rule": self.rule_id,
            "meal_finished": self.meal_finished,
            "stewards": self.stewards,
            "stewards_detail": self.stewards_detail,
            "bonus": (
                {
                    "kind": self.bonus.kind,
                    "label": self.bonus.label,
                    "camera": self.bonus.camera,
                    "t_s": self.bonus.relative_time_s,
                }
                if self.bonus
                else None
            ),
        }


class HouseholdRuleEngine:
    """Evaluates multi-camera event stream against championship game rules."""

    RULE_ID = "v10.4-household"

    def evaluate_match(
        self,
        events: List[FeedingEvent],
        meal_finished: bool = True,
        attribution_contested: bool = False,
    ) -> GameOutcome:
        """Derives championship result and bonus events from event sequence."""
        # Detect Sanbo raid at Lane 1 (TAPO)
        sanbo_raid = next((
            e for e in events
            if e.camera == "TAPO"
            and e.cat.lower() == "sanbo"
            and e.event_type in ("foreign_arrival", "cat_arrival")
        ), None)

        # Detect Dan raid at Lane 2 (LOGITECH)
        dan_counter_raid = next((
            e for e in events
            if e.camera == "LOGITECH"
            and e.cat.lower() in ("dan", "both")
            and e.event_type in ("foreign_arrival", "cat_arrival")
        ), None)

        # Bonus calculation
        bonus: Optional[BonusEvent] = None
        if dan_counter_raid:
            t_dan = dan_counter_raid.relative_time_s
            t_raid = sanbo_raid.relative_time_s if sanbo_raid else None
            is_counter = (t_raid is not None and t_dan >= t_raid)
            bonus = BonusEvent(
                kind="COUNTER RAID" if is_counter else "DAN RAID",
                label="DAN COUNTER-RAIDED SANBO" if is_counter else "DAN RAIDED SANBO",
                camera="LOGITECH",
                relative_time_s=t_dan,
            )

        # Stewards check
        stewards = "STEWARDS REVIEW" if attribution_contested else "CLEAN MATCH"
        stewards_detail = (
            "Attribution contested between cameras"
            if attribution_contested
            else "Clean camera and feeding attribution"
        )

        # Outcome derivation
        if sanbo_raid is not None:
            return GameOutcome(
                result="SANBO_WIN",
                winner="Sanbo",
                basis="RAID SUCCESS",
                rule_id=self.RULE_ID,
                meal_finished=meal_finished,
                stewards=stewards,
                stewards_detail=stewards_detail,
                bonus=bonus,
            )

        if meal_finished and not attribution_contested:
            return GameOutcome(
                result="DAN_WIN",
                winner="Dan",
                basis="DEFENDED",
                rule_id=self.RULE_ID,
                meal_finished=True,
                stewards=stewards,
                stewards_detail=stewards_detail,
                bonus=bonus,
            )

        return GameOutcome(
            result="NO_CONTEST",
            winner=None,
            basis="UNRESOLVED",
            rule_id=self.RULE_ID,
            meal_finished=meal_finished,
            stewards="STEWARDS REVIEW",
            stewards_detail="Unfinished meal or unresolved timeline",
            bonus=bonus,
        )
