from __future__ import annotations

import pytest

from app.adapter import conflicts_with_grid, to_model_inputs
from app.schemas import RankRequest


def request(commute: float = 3) -> RankRequest:
    days = ("mon", "tue", "wed", "thu", "fri", "sat")
    bins = ("0708", "0810", "1012", "1214", "1416", "1618", "1820", "2022", "2224")
    return RankRequest.model_validate({
        "context": {
            "occupancy": {day: ["OF"] * 15 for day in days},
            "preferences": {
                "commute_minutes": commute,
                "preferred_break_minutes": 30,
                "back_to_back_tolerance": 2,
                "preferred_modality": "No Preference",
                "preferred_days": {day: False for day in days},
                "avoided_days": {day: False for day in days},
                "preferred_time_bins": {item: False for item in bins},
                "avoided_time_bins": {item: False for item in bins},
            },
        },
        "meeting": {"duration_minutes": 60, "modality": "onsite", "type": "event"},
    })


@pytest.mark.parametrize(("minutes", "model_value"), [(3, 0.05), (5, 0.08333333333333333), (240, 4), (300, 300)])
def test_commute_avoids_small_minute_heuristic(minutes: float, model_value: float) -> None:
    response, _, _ = to_model_inputs(request(minutes))
    assert response["Commute"] == pytest.approx(model_value)


def test_all_preference_fields_are_explicit_and_reach_model() -> None:
    req = request()
    response, meeting, _ = to_model_inputs(req)
    for key in ("PrefMon", "PrefTue", "PrefWed", "PrefThurs", "PrefFri", "PrefSat",
                "AvoidMon", "AvoidTue", "AvoidWed", "AvoidThurs", "AvoidFri", "AvoidSat"):
        assert key in response
    for time_bin in ("0708", "0810", "1012", "1214", "1416", "1618", "1820", "2022", "2224"):
        assert f"pref_time_{time_bin}" in response
        assert f"avoid_time_{time_bin}" in response
    assert response["sched_mon_0700"] == "OF"
    assert meeting == {"meeting_length_min": 60, "meeting_modality": "Onsite", "meeting_type": "Event"}


@pytest.mark.parametrize(("value", "model_value"), [
    ("project", "Project"), ("event", "Event"), ("meeting", "Meeting")
])
def test_training_meeting_types_map_explicitly(value: str, model_value: str) -> None:
    req = RankRequest.model_validate({
        **request().model_dump(),
        "meeting": {"duration_minutes": 60, "modality": "onsite", "type": value},
    })
    _, meeting, _ = to_model_inputs(req)
    assert meeting["meeting_type"] == model_value


def test_conflict_check_is_conservative_and_includes_end_boundary() -> None:
    req = request()
    req.context.occupancy["mon"][0] = "ON"
    assert conflicts_with_grid("mon", 7, 8, req)
    assert not conflicts_with_grid("tue", 7, 8, req)
    assert conflicts_with_grid("tue", 21, 23, req)


@pytest.mark.parametrize(("duration", "last_start"), [(60, 21), (120, 20), (900, 7)])
def test_supported_duration_fits_the_grid_through_22(duration: int, last_start: int) -> None:
    req = RankRequest.model_validate({
        **request().model_dump(),
        "meeting": {"duration_minutes": duration, "modality": "onsite", "type": "event"},
    })
    assert req.meeting.duration_minutes == duration
    assert last_start + (duration // 60) == 22


@pytest.mark.parametrize("duration", [45, 90, 960])
def test_duration_rejects_non_hour_or_out_of_grid(duration: int) -> None:
    with pytest.raises(ValueError):
        RankRequest.model_validate({
            **request().model_dump(),
            "meeting": {"duration_minutes": duration, "modality": "onsite", "type": "event"},
        })
