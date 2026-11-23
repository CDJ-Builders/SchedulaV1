from __future__ import annotations

import hashlib
import importlib
import json
import os
import sys
from contextlib import contextmanager
from pathlib import Path
from types import ModuleType
from typing import Iterator

REQUIRED_ARTIFACTS = {
    "config.json", "feature_schema.json", "features.py", "golden_fixtures.json",
    "l1_models.joblib", "l2_models.joblib", "metrics.json", "predict_layered.py",
}


def artifact_dir() -> Path:
    root = Path(__file__).resolve().parents[1] / "artifacts"
    version = os.getenv("SCHEDULAML_ARTIFACT_VERSION", "1.1.0")
    if not version or version in {".", ".."} or "/" in version or "\\" in version:
        raise RuntimeError("SCHEDULAML_ARTIFACT_VERSION must be a version directory name")
    target = (root / version).resolve()
    if root.resolve() not in target.parents:
        raise RuntimeError("Artifact version path must remain inside the artifacts directory")
    return target


def verify_manifest(directory: Path) -> dict:
    manifest = json.loads((directory / "MANIFEST.json").read_text(encoding="utf-8"))
    actual_files = {path.name for path in directory.iterdir() if path.is_file() and path.name != "MANIFEST.json"}
    if not REQUIRED_ARTIFACTS.issubset(actual_files):
        missing = sorted(REQUIRED_ARTIFACTS - actual_files)
        raise RuntimeError(f"Artifact file is missing: {', '.join(missing)}")
    if set(manifest.get("files", {})) != actual_files:
        raise RuntimeError("Artifact manifest file list does not match the version directory")
    for filename, expected in manifest["files"].items():
        file_path = directory / filename
        if not file_path.is_file():
            raise RuntimeError(f"Artifact file is missing: {filename}")
        actual = hashlib.sha256(file_path.read_bytes()).hexdigest()
        if actual != expected:
            raise RuntimeError(f"Artifact checksum mismatch: {filename}")
    return manifest


@contextmanager
def _artifact_import_context(directory: Path) -> Iterator[None]:
    old_cwd = Path.cwd()
    sys.path.insert(0, str(directory))
    os.chdir(directory)
    try:
        yield
    finally:
        os.chdir(old_cwd)
        try:
            sys.path.remove(str(directory))
        except ValueError:
            pass


def load_models() -> tuple[ModuleType, ModuleType, dict, dict]:
    directory = artifact_dir().resolve()
    manifest = verify_manifest(directory)
    config = json.loads((directory / "config.json").read_text(encoding="utf-8"))
    if manifest.get("version") != config.get("version"):
        raise RuntimeError("Artifact manifest version does not match config.json")
    with _artifact_import_context(directory):
        features = importlib.import_module("features")
        predictor = importlib.import_module("predict_layered")
    schema = json.loads((directory / "feature_schema.json").read_text(encoding="utf-8"))
    metrics = json.loads((directory / "metrics.json").read_text(encoding="utf-8"))
    config["metrics"] = metrics
    return features, predictor, {**config, "artifact_dir": str(directory)}, {**schema, "manifest": manifest}
