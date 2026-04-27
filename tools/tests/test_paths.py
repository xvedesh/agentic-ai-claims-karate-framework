"""Smoke tests for the path-resolution helpers."""

from __future__ import annotations

from pathlib import Path

from tools.agents._common import paths


def test_repo_root_contains_pom() -> None:
    assert (paths.ROOT / "pom.xml").is_file()


def test_safe_rel_for_in_repo_path() -> None:
    rel = paths.safe_rel(paths.OPENAPI_SPEC)
    assert rel == "docs/openapi/claims-api.yaml"


def test_safe_rel_for_outside_path_returns_absolute() -> None:
    out = paths.safe_rel(Path("C:/this/does/not/exist") if Path("/").drive else Path("/tmp/x"))
    assert isinstance(out, str)
    assert len(out) > 0
