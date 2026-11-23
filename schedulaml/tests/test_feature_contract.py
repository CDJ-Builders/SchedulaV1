"""Synthetic occupancy and feature-contract checks; no training data involved."""
from __future__ import annotations

import importlib.util
import json

import pytest

pytest.importorskip("numpy")
pytest.importorskip("pandas")

from app.adapter import DAYS, to_model_inputs
from app.model_loader import artifact_dir
from test_adapter import request


spec = importlib.util.spec_from_file_location("schedulaml_fixture_features", artifact_dir() / "features.py")
features = importlib.util.module_from_spec(spec)
assert spec.loader is not None
spec.loader.exec_module(features)
SCHEMA = json.loads((artifact_dir() / "feature_schema.json").read_text(encoding="utf-8"))


def synthetic_request(shape: str):
    req = request()
    for day in DAYS:
        req.context.occupancy[day] = ["OF"] * 15
    if shape == "light":
        req.context.occupancy["mon"][2] = "ON"
    elif shape == "medium":
        for day, hour in [("mon", 0), ("mon", 1), ("tue", 3), ("wed", 6), ("thu", 8), ("fri", 10)]:
            req.context.occupancy[day][hour] = "OL" if hour % 2 else "ON"
    elif shape == "dense":
        for day in DAYS:
            req.context.occupancy[day] = ["ON" if hour % 2 == 0 else "OF" for hour in range(15)]
    elif shape == "near_full":
        for day in DAYS:
            req.context.occupancy[day] = ["ON"] * 15
        req.context.occupancy["tue"][3] = "OF"
    elif shape == "saturday_heavy":
        req.context.occupancy["sat"] = ["OL"] * 13 + ["OF", "OF"]
    return req


@pytest.mark.parametrize("shape", ["empty", "light", "medium", "dense", "near_full", "saturday_heavy"])
def test_synthetic_schedules_generate_only_feasible_candidates(shape: str) -> None:
    req = synthetic_request(shape)
    response, meeting, _ = to_model_inputs(req)
    candidates = features.build_candidates(response, meeting)
    if shape == "near_full":
        assert len(candidates) == 1
    elif shape == "empty":
        assert len(candidates) == 90
    else:
        assert not candidates.empty
    for row in candidates.itertuples(index=False):
        assert all(response[f"sched_{row.day}_{hour:02d}00"] == "OF" for hour in range(row.start_hour, row.end_hour))
    if not candidates.empty:
        frame = features.build_features(candidates, response, meeting)
        assert list(frame.columns) == SCHEMA["ordered_features"]


def test_preference_flags_change_the_expected_features() -> None:
    req = request()
    response, meeting, _ = to_model_inputs(req)
    candidates = features.build_candidates(response, meeting)
    baseline = features.build_features(candidates, response, meeting)
    response["PrefMon"] = 1
    response["pref_time_0708"] = 1
    preferred = features.build_features(candidates, response, meeting)
    assert (preferred["pref_day"] > baseline["pref_day"]).any()
    assert (preferred["pref_time_share"] > baseline["pref_time_share"]).any()
    response["AvoidMon"] = 1
    response["avoid_time_0708"] = 1
    avoided = features.build_features(candidates, response, meeting)
    assert (avoided["avoid_day"] > baseline["avoid_day"]).any()
    assert (avoided["avoid_time_share"] > baseline["avoid_time_share"]).any()
