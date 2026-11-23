"""Artifact regression fixtures; these are not training-parity or accuracy tests."""
from __future__ import annotations

import json
from pathlib import Path

import pytest

joblib = pytest.importorskip("joblib")
pytest.importorskip("sklearn")
pytest.importorskip("lightgbm")

from app.adapter import DAYS, TIME_BINS
from app.model_loader import load_models
from app.schemas import RankRequest
from app.scoring import rank

ARTIFACTS = Path(__file__).parents[1] / "artifacts" / "1.1.0"


def to_request(fixture: dict) -> RankRequest:
    response = fixture["response"]
    meeting = fixture["meeting"]
    occupancy = {}
    for day in DAYS:
        occupancy[day] = []
        for hour in range(7, 22):
            cell = response.get(f"sched_{day}_{hour:02d}00", False)
            occupancy[day].append(cell if cell in ("ON", "OL") else "OF")
    preferences = {
        "commute_minutes": float(response["Commute"]) * 60 if float(response["Commute"]) <= 4 else float(response["Commute"]),
        "preferred_break_minutes": float(response["Preferred Break"]),
        "back_to_back_tolerance": float(response["Back-To-Back Tolerance"]),
        "preferred_modality": response["Preferred Modality"],
        "preferred_days": {day: bool(response.get(f"Pref{'Thurs' if day == 'thu' else day.capitalize()}", False)) for day in DAYS},
        "avoided_days": {day: bool(response.get(f"Avoid{'Thurs' if day == 'thu' else day.capitalize()}", False)) for day in DAYS},
        "preferred_time_bins": {item: bool(response.get(f"pref_time_{item}", False)) for item in TIME_BINS},
        "avoided_time_bins": {item: bool(response.get(f"avoid_time_{item}", False)) for item in TIME_BINS},
    }
    return RankRequest.model_validate({
        "context": {"occupancy": occupancy, "preferences": preferences},
        "meeting": {
            "duration_minutes": meeting["meeting_length_min"],
            "modality": "onsite" if meeting["meeting_modality"] == "Onsite" else "online",
            "type": {"Project": "project", "Event": "event", "Meeting": "meeting"}[meeting["meeting_type"]],
        },
        "limit": 5,
    })


@pytest.fixture(scope="module")
def loaded():
    return load_models()


def test_feature_schema_order_on_golden_inputs(loaded) -> None:
    features, _, _, schema = loaded
    for fixture in json.loads((ARTIFACTS / "golden_fixtures.json").read_text(encoding="utf-8")):
        request = to_request(fixture)
        from app.adapter import to_model_inputs
        response, meeting, _ = to_model_inputs(request)
        candidates = features.build_candidates(response, meeting)
        if candidates.empty:
            continue
        frame = features.build_features(candidates, response, meeting)
        assert list(frame.columns) == schema["ordered_features"]


def test_service_l3_matches_original_predictor_on_golden_fixtures(loaded) -> None:
    features, predictor, config, schema = loaded
    fixtures = json.loads((ARTIFACTS / "golden_fixtures.json").read_text(encoding="utf-8"))
    used = 0
    for fixture in fixtures:
        # The model contract rejects Meeting/unknown modalities; cover only fixtures
        # whose original labels are in the supported service vocabulary.
        if fixture["meeting"]["meeting_type"] not in ("Project", "Event", "Meeting"):
            continue
        if fixture["meeting"]["meeting_modality"] not in ("Onsite", "Online"):
            continue
        request = to_request(fixture)
        response, meeting, _ = __import__("app.adapter", fromlist=["to_model_inputs"]).to_model_inputs(request)
        direct = predictor.predict_layered(response, meeting, top_k=5)
        actual, _ = rank(request, features, predictor, config, schema, "l3")
        expected = [
            {
                "weekday": {"mon": "Monday", "tue": "Tuesday", "wed": "Wednesday", "thu": "Thursday", "fri": "Friday", "sat": "Saturday"}[row["day"]],
                "start_time": f"{row['start_hour']:02d}:00",
                "end_time": f"{row['end_hour']:02d}:00",
                "score": None if len(direct) == 1 else float(row["score"]),
            }
            for row in direct
        ]
        assert actual == expected
        used += 1
    assert used > 0
