"""tests/test_models.py - Test suite for core data models."""

from datetime import date

import pytest

from models import (
    BoundingBox,
    CatProfile,
    Detection,
    FeederLane,
    FeedingEvent,
    WeightRecord,
)


def test_bounding_box_geometry_and_iou():
    box1 = BoundingBox(x1=10.0, y1=10.0, x2=50.0, y2=50.0)
    box2 = BoundingBox(x1=30.0, y1=30.0, x2=70.0, y2=70.0)
    box3 = BoundingBox(x1=100.0, y1=100.0, x2=150.0, y2=150.0)

    assert box1.width == 40.0
    assert box1.height == 40.0
    assert box1.area == 1600.0

    # Overlapping boxes
    iou12 = box1.iou(box2)
    assert 0.14 < iou12 < 0.16

    # Non-overlapping boxes
    assert box1.iou(box3) == 0.0


def test_detection_to_dict():
    det = Detection(
        class_name="Dan",
        confidence=0.95234,
        box=BoundingBox(10.0, 20.0, 110.0, 120.0),
        frame_index=42,
        relative_time_s=3.5,
    )
    d = det.to_dict()
    assert d["class_name"] == "Dan"
    assert d["confidence"] == 0.9523
    assert d["box"]["x1"] == 10.0
    assert d["frame_index"] == 42
    assert d["relative_time_s"] == 3.5


def test_cat_profile_dynamic_age_derivation():
    # Born 2020-12-09
    dan = CatProfile(
        cat_id="dan",
        name="Dan",
        breed="Tuxedo",
        date_of_birth=date(2020, 12, 9),
    )

    # Before birthday in 2026
    assert dan.calculate_age_years(as_of=date(2026, 12, 8)) == 5
    # On birthday in 2026
    assert dan.calculate_age_years(as_of=date(2026, 12, 9)) == 6
    # After birthday in 2027
    assert dan.calculate_age_years(as_of=date(2027, 1, 15)) == 6


def test_weight_history_and_trend():
    dan = CatProfile(
        cat_id="dan",
        name="Dan",
        breed="Tuxedo",
        date_of_birth=date(2020, 12, 9),
        weight_history=[
            WeightRecord(measured_date=date(2026, 8, 3), weight_kg=3.3),
            WeightRecord(measured_date=date(2026, 9, 6), weight_kg=3.5),
        ],
    )

    latest_kg, latest_date = dan.get_latest_weight()
    assert latest_kg == 3.5
    assert latest_date == date(2026, 9, 6)
    assert dan.get_weight_trend() == "gaining"


def test_feeding_event_formatting():
    ev1 = FeedingEvent(
        event_type="food_dispensed",
        camera="TAPO",
        cat="none",
        relative_time_s=0,
    )
    assert ev1.formatted_relative_time == "T+00:00"

    ev2 = FeedingEvent(
        event_type="foreign_arrival",
        camera="TAPO",
        cat="Sanbo",
        relative_time_s=75,
    )
    assert ev2.formatted_relative_time == "T+01:15"

    ev_pre = FeedingEvent(
        event_type="waiting",
        camera="TAPO",
        cat="Dan",
        relative_time_s=-10,
    )
    assert ev_pre.formatted_relative_time == "PRE-MATCH"
