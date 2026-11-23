from __future__ import annotations

import math
import os
from typing import Any

from .adapter import DAY_NAMES, conflicts_with_grid, to_model_inputs
from .schemas import RankRequest

ALLOWED_SCORERS = {"lgb", "gb", "l3"}


def selected_scorer() -> str:
    scorer = os.getenv("SCHEDULAML_SCORER", "lgb").lower()
    if scorer not in ALLOWED_SCORERS:
        raise RuntimeError("SCHEDULAML_SCORER must be one of: lgb, gb, l3")
    return scorer


def rank(request: RankRequest, features: Any, predictor: Any, config: dict, schema: dict, scorer: str) -> tuple[list[dict], list[str]]:
    response, meeting, warnings = to_model_inputs(request)
    if scorer == "l3":
        rows = predictor.predict_layered(response, meeting, top_k=100)
    else:
        candidates = features.build_candidates(response, meeting)
        if candidates.empty:
            return [], warnings + ["No feasible meeting slots are available on the supported grid."]
        feature_frame = features.build_features(candidates, response, meeting)
        if list(feature_frame.columns) != schema["ordered_features"]:
            raise RuntimeError("Generated feature order does not match feature_schema.json")
        scores = predictor.l1_models[scorer].predict(feature_frame)
        rows = candidates.assign(score=scores).sort_values("score", ascending=False).to_dict(orient="records")

    recommendations: list[dict] = []
    removed = False
    single_layered_candidate = scorer == "l3" and len(rows) == 1
    for row in rows:
        day = row.get("day")
        start = int(row.get("start_hour", -1))
        end = int(row.get("end_hour", -1))
        try:
            score = float(row.get("score"))
        except (TypeError, ValueError):
            score = float("nan")
        if conflicts_with_grid(day, start, end, request) or (not math.isfinite(score) and not single_layered_candidate):
            removed = True
            continue
        recommendations.append({
            "weekday": DAY_NAMES[day],
            "start_time": f"{start:02d}:00",
            "end_time": f"{end:02d}:00",
            "score": None if single_layered_candidate else score,
        })
        if len(recommendations) >= request.limit:
            break
    if removed:
        warnings.append("Unsafe or non-finite model candidates were removed before returning results.")
    if not recommendations:
        warnings.append("No feasible meeting slots are available on the supported grid.")
    if single_layered_candidate:
        warnings.append("Only one feasible candidate remains; its layered score is not reliable.")
    return recommendations, warnings
