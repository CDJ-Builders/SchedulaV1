from __future__ import annotations

import json
import hashlib

import pytest

from app.model_loader import REQUIRED_ARTIFACTS, verify_manifest


def write_manifest(directory, wrong: str | None = None) -> None:
    hashes = {}
    for filename in REQUIRED_ARTIFACTS:
        path = directory / filename
        path.write_text("artifact", encoding="utf-8")
        hashes[filename] = hashlib.sha256(path.read_bytes()).hexdigest()
    if wrong:
        hashes[wrong] = "not-the-checksum"
    (directory / "MANIFEST.json").write_text(json.dumps({"version": "1.1.0", "files": hashes}), encoding="utf-8")


def test_manifest_mismatch_fails_closed(tmp_path) -> None:
    write_manifest(tmp_path, wrong="features.py")
    with pytest.raises(RuntimeError, match="checksum mismatch"):
        verify_manifest(tmp_path)


def test_manifest_missing_artifact_fails_closed(tmp_path) -> None:
    (tmp_path / "features.py").write_text("changed", encoding="utf-8")
    (tmp_path / "MANIFEST.json").write_text(json.dumps({"files": {"features.py": "abc"}}), encoding="utf-8")
    with pytest.raises(RuntimeError, match="missing"):
        verify_manifest(tmp_path)
