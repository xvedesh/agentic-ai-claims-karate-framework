"""Project-relative paths used by every agent.

The repo root is detected by walking up from this file until a directory
containing ``pom.xml`` is found. This avoids depending on the user's CWD
when running ``python -m tools.cli ...`` from anywhere inside the repo.
"""

from __future__ import annotations

from pathlib import Path


def repo_root() -> Path:
    here = Path(__file__).resolve()
    for parent in [here, *here.parents]:
        if (parent / "pom.xml").is_file():
            return parent
    raise RuntimeError(
        "Could not locate repo root (no pom.xml found in any parent of "
        f"{here})."
    )


ROOT = repo_root()

DOCS = ROOT / "docs"
OPENAPI_SPEC = DOCS / "openapi" / "claims-api.yaml"
BUSINESS_RULES = DOCS / "business-rules.md"
TEST_STRATEGY = DOCS / "test-strategy.md"
README = ROOT / "README.md"

SERVER_DIR = ROOT / "server"
SEED_DATA = SERVER_DIR / "data" / "seed-data.json"
RULES_DIR = SERVER_DIR / "rules"

KARATE_FEATURES = ROOT / "src" / "test" / "resources" / "features"
KARATE_REPORTS = ROOT / "target" / "karate-reports"
KARATE_SUMMARY_JSON = KARATE_REPORTS / "karate-summary-json.txt"
SUREFIRE_REPORTS = ROOT / "target" / "surefire-reports"

REPORTS_DIR = ROOT / "reports"
GENERATED_DIR = ROOT / "generated"
GENERATED_FEATURES = GENERATED_DIR / "features"
PATCHES_DIR = REPORTS_DIR / "patches"


def ensure_dir(p: Path) -> Path:
    p.mkdir(parents=True, exist_ok=True)
    return p


def safe_rel(target: Path) -> str:
    """Return *target* relative to repo root if possible, else absolute."""
    target = target.resolve()
    try:
        return target.relative_to(ROOT).as_posix()
    except ValueError:
        return str(target)
