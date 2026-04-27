"""Agent 1 - Setup Doctor / Troubleshooting.

Three sub-commands:

    python -m tools.cli doctor         - environment + repo health check
    python -m tools.cli run-smoke      - run the @smoke Karate tag
    python -m tools.cli explain TOPIC  - print a curated docs section

All three are deterministic and fully offline. No LLM is used; the doctor
is meant to be the first thing an SDET runs when a fresh clone refuses
to behave, so it must work without any configuration.
"""

from __future__ import annotations

import json
import os
import re
import socket
import sys
from dataclasses import dataclass, field
from pathlib import Path
from typing import Callable, Optional

import httpx

from ._common import paths
from ._common import printer as p
from ._common.process_runner import run, which
from ._common.llm import is_llm_enabled, configured_provider


# ---------------------------------------------------------------------------
# Check primitives
# ---------------------------------------------------------------------------

@dataclass
class CheckResult:
    name: str
    status: str  # PASS | WARN | FAIL
    detail: str
    fix_hint: Optional[str] = None


@dataclass
class DoctorReport:
    checks: list[CheckResult] = field(default_factory=list)

    def add(self, r: CheckResult) -> None:
        self.checks.append(r)

    def summary(self) -> tuple[int, int, int]:
        passed = sum(1 for c in self.checks if c.status == "PASS")
        warned = sum(1 for c in self.checks if c.status == "WARN")
        failed = sum(1 for c in self.checks if c.status == "FAIL")
        return passed, warned, failed

    def overall_ok(self) -> bool:
        return all(c.status != "FAIL" for c in self.checks)


# ---------------------------------------------------------------------------
# Individual checks
# ---------------------------------------------------------------------------

_VERSION_RE = re.compile(r"(\d+)\.(\d+)(?:\.(\d+))?")


def _parse_major(text: str) -> Optional[int]:
    m = _VERSION_RE.search(text or "")
    return int(m.group(1)) if m else None


def _check_java() -> CheckResult:
    if not which("java"):
        return CheckResult(
            "java",
            "FAIL",
            "java not found on PATH",
            "Install JDK 17+ and ensure 'java' is on PATH.",
        )
    res = run(["java", "-version"], timeout=10.0)
    raw = res.combined
    major = _parse_major(raw)
    if major is None:
        return CheckResult("java", "WARN", f"unparseable version: {raw[:80]}")
    if major < 17:
        return CheckResult(
            "java",
            "FAIL",
            f"Java {major} found; need >= 17",
            "Install JDK 17 (or newer) and put it first on PATH.",
        )
    return CheckResult("java", "PASS", f"Java {major} OK")


def _check_maven_wrapper() -> CheckResult:
    cmd_path = paths.ROOT / ("mvnw.cmd" if os.name == "nt" else "mvnw")
    if not cmd_path.is_file():
        return CheckResult(
            "maven-wrapper",
            "FAIL",
            f"missing {cmd_path.name}",
            "Re-clone the repo or run 'mvn -N io.takari:maven:wrapper'.",
        )
    return CheckResult("maven-wrapper", "PASS", f"{cmd_path.name} present")


def _check_node() -> CheckResult:
    if not which("node"):
        return CheckResult(
            "node",
            "FAIL",
            "node not found on PATH",
            "Install Node 20+ and ensure 'node' is on PATH.",
        )
    res = run(["node", "--version"], timeout=10.0)
    major = _parse_major(res.stdout)
    if major is None:
        return CheckResult("node", "WARN", f"unparseable version: {res.stdout!r}")
    if major < 20:
        return CheckResult(
            "node",
            "FAIL",
            f"Node {major} found; need >= 20",
            "Install Node 20+ (e.g. via nvm) and put it first on PATH.",
        )
    return CheckResult("node", "PASS", f"Node {major} OK")


def _check_npm() -> CheckResult:
    if not which("npm"):
        return CheckResult(
            "npm",
            "WARN",
            "npm not found on PATH (optional, only needed to install server deps)",
        )
    return CheckResult("npm", "PASS", f"npm at {which('npm')}")


def _check_python() -> CheckResult:
    major, minor = sys.version_info[:2]
    if (major, minor) < (3, 10):
        return CheckResult(
            "python",
            "FAIL",
            f"Python {major}.{minor} found; need >= 3.10",
            "Use a Python 3.10+ interpreter (you can keep your current venv).",
        )
    return CheckResult("python", "PASS", f"Python {major}.{minor} OK")


def _is_port_listening(host: str, port: int) -> bool:
    with socket.socket(socket.AF_INET, socket.SOCK_STREAM) as s:
        s.settimeout(0.3)
        try:
            s.connect((host, port))
            return True
        except (OSError, socket.timeout):
            return False


def _check_health_probe() -> CheckResult:
    if not _is_port_listening("127.0.0.1", 3000):
        return CheckResult(
            "server-port",
            "WARN",
            "no listener on localhost:3000",
            "Start the Node service: cd server; npm install; npm start",
        )
    try:
        resp = httpx.get("http://localhost:3000/health", timeout=2.0)
    except httpx.HTTPError as e:
        return CheckResult(
            "server-health",
            "FAIL",
            f"port 3000 is busy but /health did not answer: {e}",
            "Some other process owns 3000 - stop it, then start the sandbox.",
        )
    if resp.status_code != 200:
        return CheckResult(
            "server-health",
            "FAIL",
            f"/health returned HTTP {resp.status_code}",
            "Check server logs for startup errors.",
        )
    body = resp.json()
    if body.get("status") != "UP":
        return CheckResult(
            "server-health",
            "FAIL",
            f"/health body = {body}",
        )
    return CheckResult("server-health", "PASS", f"/health UP (version {body.get('version')})")


def _check_repo_layout() -> CheckResult:
    required = [
        paths.OPENAPI_SPEC,
        paths.SEED_DATA,
        paths.RULES_DIR,
        paths.KARATE_FEATURES,
        paths.ROOT / "pom.xml",
    ]
    missing = [r.relative_to(paths.ROOT).as_posix() for r in required if not r.exists()]
    if missing:
        return CheckResult(
            "repo-layout",
            "FAIL",
            f"missing: {', '.join(missing)}",
            "Re-clone or check git status; the agent expects the standard layout.",
        )
    return CheckResult("repo-layout", "PASS", "OpenAPI, seed data, rules, features all present")


def _check_llm_config() -> CheckResult:
    if not is_llm_enabled():
        return CheckResult(
            "llm",
            "PASS",
            "LLM_ENABLED=false (offline mode - default)",
        )
    provider = configured_provider() or "?"
    if provider == "openai" and not os.getenv("OPENAI_API_KEY"):
        return CheckResult("llm", "WARN", "LLM_ENABLED=true but OPENAI_API_KEY is unset")
    if provider == "anthropic" and not os.getenv("ANTHROPIC_API_KEY"):
        return CheckResult("llm", "WARN", "LLM_ENABLED=true but ANTHROPIC_API_KEY is unset")
    return CheckResult("llm", "PASS", f"LLM enabled, provider={provider}")


_CHECKS: list[Callable[[], CheckResult]] = [
    _check_python,
    _check_java,
    _check_maven_wrapper,
    _check_node,
    _check_npm,
    _check_repo_layout,
    _check_health_probe,
    _check_llm_config,
]


# ---------------------------------------------------------------------------
# Public surface
# ---------------------------------------------------------------------------

def run_doctor() -> int:
    p.hr("Setup Doctor")
    report = DoctorReport()
    for check in _CHECKS:
        result = check()
        report.add(result)
        glyph = {"PASS": p.ok, "WARN": p.warn, "FAIL": p.fail}[result.status]
        glyph(f"{result.name}: {result.detail}")

    passed, warned, failed = report.summary()
    p.hr("Summary")
    p.plain(f"  PASS: {passed}   WARN: {warned}   FAIL: {failed}")
    _write_doctor_report(report)
    return 0 if report.overall_ok() else 1


def _write_doctor_report(report: DoctorReport) -> None:
    out = paths.ensure_dir(paths.REPORTS_DIR) / "doctor-report.md"
    lines = ["# Doctor Report", ""]
    lines.append("| Check | Status | Detail | Fix hint |")
    lines.append("|---|---|---|---|")
    for c in report.checks:
        hint = (c.fix_hint or "").replace("|", "\\|")
        detail = c.detail.replace("|", "\\|")
        lines.append(f"| `{c.name}` | **{c.status}** | {detail} | {hint} |")
    passed, warned, failed = report.summary()
    lines.extend(
        [
            "",
            f"_Totals_: **PASS={passed}**, **WARN={warned}**, **FAIL={failed}**.",
            "",
            "_Generated by `python -m tools.cli doctor`._",
        ]
    )
    out.write_text("\n".join(lines), encoding="utf-8")
    p.info(f"  wrote {paths.safe_rel(out)}")


def run_smoke() -> int:
    p.hr("Run @smoke Karate tag")
    if not _is_port_listening("127.0.0.1", 3000):
        p.fail("No listener on localhost:3000.")
        p.warn("Start the Node service first:  cd server; npm install; npm start")
        return 2
    cmd_path = paths.ROOT / ("mvnw.cmd" if os.name == "nt" else "mvnw")
    if not cmd_path.is_file():
        p.fail(f"Missing {cmd_path.name}")
        return 3
    p.info(f"Running: {cmd_path.name} test -Dkarate.options=--tags @smoke")
    res = run(
        [str(cmd_path), "test", "-Dkarate.options=--tags @smoke"],
        cwd=paths.ROOT,
        timeout=240.0,
    )
    if "BUILD SUCCESS" in res.stdout:
        p.ok("Karate @smoke passed.")
        return 0
    p.fail(f"Karate @smoke did not pass (exit={res.returncode}).")
    p.plain(res.stdout[-1500:] if res.stdout else res.stderr[-1500:])
    return res.returncode or 1


# ---------------------------------------------------------------------------
# explain
# ---------------------------------------------------------------------------

_TOPIC_MAP = {
    "setup": (paths.README, "## Quick start", "## Common Karate runs"),
    "rules": (paths.BUSINESS_RULES, "# ", None),
    "tags": (paths.TEST_STRATEGY, "## Tag taxonomy", "## Folder layout"),
    "reports": (paths.TEST_STRATEGY, "## Reports", "## How to run"),
    "agents": (paths.ROOT / "AGENTS.md", "# AGENTS.md", None),
    "tools": (paths.ROOT / "docs" / "ai-sdet-tooling.md", "# ", None),
    "troubleshooting": None,  # handled inline
}


def _slice_doc(path: Path, start: str, end: Optional[str]) -> str:
    text = path.read_text(encoding="utf-8")
    lines = text.splitlines()
    out: list[str] = []
    capturing = False
    for line in lines:
        if not capturing and line.startswith(start):
            capturing = True
        if capturing:
            if end is not None and line.startswith(end) and out:
                break
            out.append(line)
    return "\n".join(out).rstrip() or text  # fall back to whole doc


_TROUBLESHOOTING = """\
# Troubleshooting

| Symptom | Likely cause | Fix |
|---|---|---|
| Karate scenarios time out | Node server not running | `cd server; npm start` |
| 401 on every request | callSingle login failed | check `karate-config.js` baseUrl, restart server |
| 409 CLAIM_ALREADY_SUBMITTED | scenario re-using a claim id | scenario should call `/api/admin/reset` in Background |
| `Tests run: 0` from Surefire | runner class doesn't match `*Test` | pom.xml includes `**/*Runner.java` (already wired) |
| `match failed: EQUALS` on amount | adjudication math drift | run `python -m tools.cli analyze` for a categorized report |
| FRAUD/ABUSE/WASTE rule fires unexpectedly | seed history in store | call `/api/admin/reset` first |
| `python -m tools.cli` errors immediately | wrong venv | activate `.venv` and `pip install -e .\\tools` |
"""


def explain(topic: str) -> int:
    topic = topic.strip().lower()
    p.hr(f"explain: {topic}")
    if topic == "troubleshooting":
        p.plain(_TROUBLESHOOTING)
        return 0
    spec = _TOPIC_MAP.get(topic)
    if spec is None:
        p.fail(f"Unknown topic: {topic}")
        p.warn("Known topics: " + ", ".join(sorted(_TOPIC_MAP)))
        return 2
    path, start, end = spec
    if not path.exists():
        p.fail(f"Source doc missing: {path}")
        return 3
    snippet = _slice_doc(path, start, end)
    p.plain(snippet)
    p.info(f"\n_(source: {paths.safe_rel(path)})_")
    return 0
