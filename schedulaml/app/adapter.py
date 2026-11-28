from __future__ import annotations

from typing import Any

from .schemas import RankRequest

DAY_NAMES = {"mon": "Monday", "tue": "Tuesday", "wed": "Wednesday", "thu": "Thursday", "fri": "Friday", "sat": "Saturday"}
DAYS = tuple(DAY_NAMES)
TIME_BINS = ("0708", "0810", "1012", "1214", "1416", "1618", "1820", "2022", "2224")


def to_model_inputs(request: RankRequest) -> tuple[dict[str, Any], dict[str, Any], list[str]]:
    """Map a validated API request into the model input dictionaries and warnings."""
    """Build every input read by features.py; never rely on its silent defaults."""
    response: dict[str, Any] = {}
    warnings: list[str] = list(request.context.warnings)
    for day in DAYS:
        for offset, cell in enumerate(request.context.occupancy[day]):
            response[f"sched_{day}_{offset + 7:02d}00"] = cell
    for day in DAYS:
        name = "Thurs" if day == "thu" else day.capitalize()
        response[f"Pref{name}"] = int(request.context.preferences.preferred_days[day])
        response[f"Avoid{name}"] = int(request.context.preferences.avoided_days[day])
    for time_bin in TIME_BINS:
        response[f"pref_time_{time_bin}"] = int(request.context.preferences.preferred_time_bins[time_bin])
        response[f"avoid_time_{time_bin}"] = int(request.context.preferences.avoided_time_bins[time_bin])

    commute = request.context.preferences.commute_minutes
    # features.py treats values <= 4 as hours and multiplies by 60.
    response["Commute"] = commute / 60 if commute <= 240 else commute
    response["Preferred Break"] = request.context.preferences.preferred_break_minutes
    response["Back-To-Back Tolerance"] = request.context.preferences.back_to_back_tolerance
    response["Preferred Modality"] = request.context.preferences.preferred_modality
    meeting = {
        "meeting_length_min": request.meeting.duration_minutes,
        "meeting_modality": "Onsite" if request.meeting.modality == "onsite" else "Online",
        "meeting_type": {"project": "Project", "event": "Event", "meeting": "Meeting"}[request.meeting.type],
    }
    return response, meeting, warnings


def conflicts_with_grid(day: str, start: int, end: int, request: RankRequest) -> bool:
    """Return whether a candidate interval intersects occupied schedule cells."""
    if day not in request.context.occupancy or start < 7 or end > 22 or end <= start:
        return True
    cells = request.context.occupancy[day]
    return any(cells[hour - 7] != "OF" for hour in range(start, end))
