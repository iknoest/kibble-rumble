"""tests/test_rule_engine.py - Test suite for championship game rules (v10.4-household)."""

import pytest

from models import FeedingEvent
from rule_engine import HouseholdRuleEngine


def test_rule_sanbo_win_raid_success():
    engine = HouseholdRuleEngine()
    events = [
        FeedingEvent(event_type="food_dispensed", camera="TAPO", cat="none", relative_time_s=0),
        FeedingEvent(event_type="cat_arrival", camera="TAPO", cat="Dan", relative_time_s=0),
        FeedingEvent(event_type="foreign_arrival", camera="TAPO", cat="Sanbo", relative_time_s=15),
    ]

    outcome = engine.evaluate_match(events, meal_finished=True)
    assert outcome.result == "SANBO_WIN"
    assert outcome.winner == "Sanbo"
    assert outcome.basis == "RAID SUCCESS"
    assert outcome.stewards == "CLEAN MATCH"


def test_rule_dan_win_defended():
    engine = HouseholdRuleEngine()
    events = [
        FeedingEvent(event_type="food_dispensed", camera="TAPO", cat="none", relative_time_s=0),
        FeedingEvent(event_type="cat_arrival", camera="TAPO", cat="Dan", relative_time_s=0),
        FeedingEvent(event_type="meal_finish", camera="TAPO", cat="Dan", relative_time_s=210),
    ]

    outcome = engine.evaluate_match(events, meal_finished=True)
    assert outcome.result == "DAN_WIN"
    assert outcome.winner == "Dan"
    assert outcome.basis == "DEFENDED"
    assert outcome.bonus is None


def test_rule_dan_counter_raid_bonus():
    engine = HouseholdRuleEngine()
    events = [
        FeedingEvent(event_type="foreign_arrival", camera="TAPO", cat="Sanbo", relative_time_s=15),
        FeedingEvent(event_type="foreign_arrival", camera="LOGITECH", cat="Dan", relative_time_s=75),
    ]

    outcome = engine.evaluate_match(events, meal_finished=True)
    assert outcome.result == "SANBO_WIN"
    assert outcome.bonus is not None
    assert outcome.bonus.kind == "COUNTER RAID"
    assert outcome.bonus.label == "DAN COUNTER-RAIDED SANBO"


def test_rule_no_contest_on_unresolved_attribution():
    engine = HouseholdRuleEngine()
    events = [
        FeedingEvent(event_type="cat_arrival", camera="TAPO", cat="Dan", relative_time_s=0),
    ]

    outcome = engine.evaluate_match(events, meal_finished=False, attribution_contested=True)
    assert outcome.result == "NO_CONTEST"
    assert outcome.winner is None
    assert outcome.basis == "UNRESOLVED"
    assert outcome.stewards == "STEWARDS REVIEW"
