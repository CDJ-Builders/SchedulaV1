from __future__ import annotations

import hmac
import logging
import os
import time
from contextlib import asynccontextmanager
from typing import Any

from fastapi import FastAPI, Header, HTTPException, Request
from fastapi.responses import JSONResponse

from .model_loader import load_models
from .schemas import ModelInfo, RankRequest, RankResponse
from .scoring import rank, selected_scorer

logger = logging.getLogger("schedulaml")
STATE: dict[str, Any] = {}


@asynccontextmanager
async def lifespan(_: FastAPI):
    """Load the verified model bundle for the lifetime of the API process."""
    features, predictor, config, schema = load_models()
    STATE.update(features=features, predictor=predictor, config=config, schema=schema, scorer=selected_scorer())
    yield
    STATE.clear()


app = FastAPI(title="Schedula MindLab", version="1.1.0", lifespan=lifespan)


@app.middleware("http")
async def limit_request_size(request: Request, call_next):
    """Reject oversized request bodies before endpoint parsing."""
    raw_length = request.headers.get("content-length")
    if raw_length:
        try:
            if int(raw_length) > 65536:
                return JSONResponse(status_code=413, content={"detail": "Request body is too large"})
        except ValueError:
            return JSONResponse(status_code=400, content={"detail": "Invalid content length"})
    return await call_next(request)


def check_key(supplied: str | None) -> None:
    """Require the configured service key when private API authentication is enabled."""
    expected = os.getenv("SCHEDULAML_API_KEY")
    if expected and not hmac.compare_digest(supplied or "", expected):
        raise HTTPException(status_code=401, detail="Invalid service credentials")


@app.post("/rank", response_model=RankResponse)
def rank_endpoint(payload: RankRequest, x_schedulaml_key: str | None = Header(default=None)):
    """Validate, map, and score a recommendation request."""
    check_key(x_schedulaml_key)
    started = time.perf_counter()
    try:
        rows, warnings = rank(payload, STATE["features"], STATE["predictor"], STATE["config"], STATE["schema"], STATE["scorer"])
    except Exception as exc:
        logger.exception("Inference failed")
        raise HTTPException(status_code=503, detail="Scheduling recommendations are temporarily unavailable") from exc
    elapsed_ms = round((time.perf_counter() - started) * 1000, 2)
    model = ModelInfo(name=f"schedulaml-{STATE['scorer']}", version=STATE["config"]["version"])
    logger.info("inference_complete model=%s version=%s latency_ms=%s", model.name, model.version, elapsed_ms)
    return RankResponse(recommendations=rows, model=model, warnings=warnings)


@app.get("/health")
def health_endpoint(x_schedulaml_key: str | None = Header(default=None)):
    """Report API and model readiness for health checks."""
    check_key(x_schedulaml_key)
    if not STATE:
        raise HTTPException(status_code=503, detail="Model artifacts are not loaded")
    return {"status": "ok", "artifacts_loaded": True, "manifest_verified": True}


@app.get("/version")
def version_endpoint(x_schedulaml_key: str | None = Header(default=None)):
    """Report the loaded model version and artifact metadata."""
    check_key(x_schedulaml_key)
    if not STATE:
        raise HTTPException(status_code=503, detail="Model artifacts are not loaded")
    return {
        "name": f"schedulaml-{STATE['scorer']}",
        "version": STATE["config"]["version"],
        "scorer": STATE["scorer"],
        "grid": STATE["config"]["grid_bounds"],
        "days": STATE["config"]["days"],
        "metrics_summary": STATE["config"]["metrics"].get(f"pred_{STATE['scorer']}", {}),
        "score_semantics": "relative ranking score; not a probability and not comparable across requests",
    }
