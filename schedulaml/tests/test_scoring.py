from __future__ import annotations

from types import SimpleNamespace

from app.scoring import rank
from test_adapter import request


class FakePredictor:
    def predict_layered(self, response, meeting, top_k):
        return [
            {"day": "mon", "start_hour": 7, "end_hour": 8, "score": float("nan")},
            {"day": "tue", "start_hour": 7, "end_hour": 8, "score": 0.9},
            {"day": "wed", "start_hour": 7, "end_hour": 8, "score": 0.8},
        ][:top_k]


class SinglePredictor:
    def predict_layered(self, response, meeting, top_k):
        return [{"day": "tue", "start_hour": 7, "end_hour": 8, "score": float("nan")}]


def test_layered_results_drop_nonfinite_and_keep_safe_slots() -> None:
    req = request()
    rows, warnings = rank(req, SimpleNamespace(), FakePredictor(), {"version": "1.1.0"}, {}, "l3")
    assert [row["weekday"] for row in rows[:2]] == ["Tuesday", "Wednesday"]
    assert any("removed" in warning for warning in warnings)


def test_single_candidate_is_returned_with_warning() -> None:
    req = request()
    rows, warnings = rank(req, SimpleNamespace(), SinglePredictor(), {"version": "1.1.0"}, {}, "l3")
    assert rows
    assert rows[0]["score"] is None
    assert any("Only one feasible candidate" in warning for warning in warnings)
