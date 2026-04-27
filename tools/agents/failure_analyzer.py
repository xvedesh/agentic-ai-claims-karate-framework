"""Agent 2 - Failure Analyzer (with conservative fix-proposal capability).

Reads Karate's per-feature Cucumber-compatible JSON
(``target/karate-reports/features.*.json``) plus the aggregate
``karate-summary-json.txt`` and produces:

* ``reports/ai-failure-analysis.json``   - machine-readable findings
* ``reports/ai-failure-analysis.md``     - human Markdown
* ``reports/ai-failure-analysis.html``   - lightweight static HTML

Categorisation is deterministic and rule-based:

    INTENTIONAL_DEMO      tagged @intentional-failure or under _demo/
    ENV_CONNECTIVITY      ECONNREFUSED / "Connection refused" / "timed out"
    CONTRACT_DRIFT        "status code was: <X>, expecting: <Y>"
    ASSERTION_DRIFT       "match failed: EQUALS|NOT_EQUALS"
    DATA_SETUP            error envelope with code in
                          {INVALID_REQUEST, UNKNOWN_PROCEDURE, INVALID_*}
    RULE_LOGIC            failure inside fraud/, abuse/, waste/ that
                          isn't otherwise classified
    UNCLASSIFIED          everything else

LLM enrichment is opt-in via ``LLM_ENABLED=true``; the categoriser
itself does not call it.
"""

from __future__ import annotations

import datetime as _dt
import html
import json
import re
from dataclasses import dataclass, field
from pathlib import Path
from typing import Iterable, Optional

from ._common import paths
from ._common import printer as p


# ---------------------------------------------------------------------------
# Data model
# ---------------------------------------------------------------------------

@dataclass
class Finding:
    feature: str           # relative path under src/test/resources
    scenario: str          # scenario name
    line: int              # gherkin line of the failing step
    step: str              # text of the failing step
    error: str             # raw error text (trimmed)
    category: str          # one of the constants below
    confidence: str        # HIGH | MEDIUM | LOW
    tags: list[str] = field(default_factory=list)
    suggested_action: str = ""

    def as_dict(self) -> dict:
        return {
            "feature": self.feature,
            "scenario": self.scenario,
            "line": self.line,
            "step": self.step,
            "error": self.error,
            "category": self.category,
            "confidence": self.confidence,
            "tags": self.tags,
            "suggestedAction": self.suggested_action,
        }


CATEGORIES = (
    "INTENTIONAL_DEMO",
    "ENV_CONNECTIVITY",
    "CONTRACT_DRIFT",
    "ASSERTION_DRIFT",
    "DATA_SETUP",
    "RULE_LOGIC",
    "UNCLASSIFIED",
)

_SUGGESTED_ACTION = {
    "INTENTIONAL_DEMO":  "Expected to fail. Do NOT 'fix' this scenario - it feeds the failure-analyzer demo.",
    "ENV_CONNECTIVITY":  "Server unreachable. Run `python -m tools.cli doctor`; restart the Node service if needed.",
    "CONTRACT_DRIFT":    "Status code mismatch. Check the OpenAPI spec vs the actual route - one of them drifted.",
    "ASSERTION_DRIFT":   "Value mismatch. Confirm whether the test or the rule is correct before changing either.",
    "DATA_SETUP":        "Validator rejected the request. Check the seed fixture or the request body shape.",
    "RULE_LOGIC":        "A rule fired (or didn't fire) unexpectedly. Inspect alert.evidence and the rule's guardrails.",
    "UNCLASSIFIED":      "Could not auto-classify. Review the raw error and the scenario's last step.",
}


# ---------------------------------------------------------------------------
# Categoriser
# ---------------------------------------------------------------------------

_CONNECTIVITY_RE = re.compile(
    r"(ECONNREFUSED|connection refused|timed out|connect timed out|read timed out)",
    re.IGNORECASE,
)
_STATUS_DRIFT_RE = re.compile(
    r"status code was:\s*(\d+),\s*expecting:\s*(\d+)",
    re.IGNORECASE,
)
_MATCH_FAILED_RE = re.compile(r"match failed:\s*(EQUALS|NOT_EQUALS|CONTAINS|NOT_CONTAINS)")
_ENVELOPE_DATA_CODES = re.compile(
    r"error\.code.*?(INVALID_REQUEST|UNKNOWN_PROCEDURE|INVALID_MEMBER|INVALID_PROVIDER|INVALID_ENCOUNTER)",
    re.IGNORECASE,
)


def _is_intentional(feature_path: str, tags: Iterable[str]) -> bool:
    if "_demo/" in feature_path or "/_demo/" in feature_path:
        return True
    return any(t in {"@intentional-failure", "@demo-failure"} for t in tags)


def _classify(error: str, feature: str, tags: Iterable[str]) -> tuple[str, str]:
    """Return (category, confidence) for a single failure."""
    err = error or ""
    tag_list = list(tags)
    if _is_intentional(feature, tag_list):
        return "INTENTIONAL_DEMO", "HIGH"
    if _CONNECTIVITY_RE.search(err):
        return "ENV_CONNECTIVITY", "HIGH"
    if _STATUS_DRIFT_RE.search(err):
        return "CONTRACT_DRIFT", "HIGH"
    if _ENVELOPE_DATA_CODES.search(err):
        return "DATA_SETUP", "MEDIUM"
    if _MATCH_FAILED_RE.search(err):
        # ASSERTION_DRIFT vs RULE_LOGIC: if the failing scenario lives under
        # a rule folder AND the diff mentions a ruleCode/winningAction/status
        # field, prefer RULE_LOGIC.
        if any(seg in feature for seg in ("/fraud/", "/abuse/", "/waste/", "\\fraud\\", "\\abuse\\", "\\waste\\")):
            if re.search(r"(ruleCode|winningAction|adjudication\.status|recommendedAction)", err):
                return "RULE_LOGIC", "MEDIUM"
        return "ASSERTION_DRIFT", "MEDIUM"
    return "UNCLASSIFIED", "LOW"


# ---------------------------------------------------------------------------
# Karate-JSON parsing
# ---------------------------------------------------------------------------

def _iter_feature_files(reports_dir: Path) -> list[Path]:
    return sorted(reports_dir.glob("features.*.json"))


def _extract_failures(feature_json: dict, source_relpath: str) -> list[Finding]:
    out: list[Finding] = []
    elements = feature_json.get("elements") or []
    for el in elements:
        if el.get("type") != "scenario":
            continue
        steps = el.get("steps") or []
        scenario_name = el.get("name") or "<unnamed>"
        scenario_tags = [t.get("name") for t in (el.get("tags") or []) if t.get("name")]
        for step in steps:
            result = step.get("result") or {}
            if result.get("status") != "failed":
                continue
            err = (result.get("error_message") or "").strip()
            line = step.get("line") or 0
            step_text = f'{step.get("keyword","").strip()} {step.get("name","").strip()}'.strip()
            category, confidence = _classify(err, source_relpath, scenario_tags)
            out.append(
                Finding(
                    feature=source_relpath,
                    scenario=scenario_name,
                    line=int(line),
                    step=step_text,
                    error=_trim(err, 1500),
                    category=category,
                    confidence=confidence,
                    tags=scenario_tags,
                    suggested_action=_SUGGESTED_ACTION[category],
                )
            )
            break  # first failed step per scenario is enough
    return out


def _trim(s: str, limit: int) -> str:
    if len(s) <= limit:
        return s
    return s[: limit - 3].rstrip() + "..."


def _normalise_feature_relpath(feature_json: dict) -> str:
    raw = (
        feature_json.get("uri")
        or feature_json.get("relativePath")
        or feature_json.get("name")
        or "<unknown>"
    )
    return str(raw).replace("\\", "/")


# ---------------------------------------------------------------------------
# Public surface
# ---------------------------------------------------------------------------

def analyze(
    karate_reports: Optional[str] = None,
    surefire_reports: Optional[str] = None,
    server_log: Optional[str] = None,
) -> int:
    reports_dir = Path(karate_reports) if karate_reports else paths.KARATE_REPORTS
    if not reports_dir.exists():
        p.fail(f"Karate reports directory not found: {reports_dir}")
        p.warn("Run the Karate suite first:  .\\mvnw.cmd test")
        return 2

    p.hr("Failure Analyzer")
    feature_files = _iter_feature_files(reports_dir)
    p.info(f"Reading {len(feature_files)} per-feature reports from {reports_dir}")

    findings: list[Finding] = []
    for f in feature_files:
        try:
            payload = json.loads(f.read_text(encoding="utf-8"))
        except json.JSONDecodeError as e:
            p.warn(f"  skip {f.name}: {e}")
            continue
        if isinstance(payload, list):
            for feature_json in payload:
                rel = _normalise_feature_relpath(feature_json)
                findings.extend(_extract_failures(feature_json, rel))
        elif isinstance(payload, dict):
            rel = _normalise_feature_relpath(payload)
            findings.extend(_extract_failures(payload, rel))

    summary_path = reports_dir / "karate-summary-json.txt"
    totals = _read_totals(summary_path)

    paths.ensure_dir(paths.REPORTS_DIR)
    json_path = paths.REPORTS_DIR / "ai-failure-analysis.json"
    md_path = paths.REPORTS_DIR / "ai-failure-analysis.md"
    html_path = paths.REPORTS_DIR / "ai-failure-analysis.html"

    counts = _category_counts(findings)
    payload = {
        "generatedAt": _dt.datetime.utcnow().isoformat(timespec="seconds") + "Z",
        "source": str(reports_dir),
        "totals": totals,
        "categoryCounts": counts,
        "findings": [f.as_dict() for f in findings],
    }
    json_path.write_text(json.dumps(payload, indent=2), encoding="utf-8")
    md_path.write_text(_render_markdown(payload), encoding="utf-8")
    html_path.write_text(_render_html(payload), encoding="utf-8")

    p.ok(f"Wrote {paths.safe_rel(json_path)}")
    p.ok(f"Wrote {paths.safe_rel(md_path)}")
    p.ok(f"Wrote {paths.safe_rel(html_path)}")
    if findings:
        rows = [[c, str(counts.get(c, 0))] for c in CATEGORIES if counts.get(c)]
        p.table(["Category", "Count"], rows, title="Failure breakdown")
    else:
        p.ok("No failed scenarios found in the report.")
    return 0


def _read_totals(summary_path: Path) -> dict:
    if not summary_path.is_file():
        return {}
    try:
        s = json.loads(summary_path.read_text(encoding="utf-8"))
    except json.JSONDecodeError:
        return {}
    return {
        "featuresPassed": s.get("featuresPassed"),
        "featuresFailed": s.get("featuresFailed"),
        "scenariosPassed": s.get("scenariosPassed"),
        "scenariosFailed": s.get("scenariosfailed"),  # note: lowercase 'f' in Karate's output
        "elapsedMillis": s.get("elapsedTime"),
    }


def _category_counts(findings: list[Finding]) -> dict[str, int]:
    out = {c: 0 for c in CATEGORIES}
    for f in findings:
        out[f.category] = out.get(f.category, 0) + 1
    return out


def _render_markdown(payload: dict) -> str:
    findings = payload["findings"]
    counts = payload["categoryCounts"]
    totals = payload["totals"]
    lines = [
        "# Failure Analysis",
        "",
        f"_Generated_ `{payload['generatedAt']}`",
        "",
        "## Totals",
        "",
        f"- features: passed={totals.get('featuresPassed','?')} failed={totals.get('featuresFailed','?')}",
        f"- scenarios: passed={totals.get('scenariosPassed','?')} failed={totals.get('scenariosFailed','?')}",
        f"- elapsed: {totals.get('elapsedMillis','?')} ms",
        "",
        "## Category breakdown",
        "",
        "| Category | Count |",
        "|---|---:|",
    ]
    for cat in CATEGORIES:
        if counts.get(cat):
            lines.append(f"| `{cat}` | {counts[cat]} |")
    if not findings:
        lines += ["", "_No failures found._"]
        return "\n".join(lines) + "\n"

    lines += ["", "## Findings", ""]
    for i, f in enumerate(findings, start=1):
        lines += [
            f"### {i}. `{f['category']}` - {f['scenario']}",
            "",
            f"- **feature**: `{f['feature']}` (line {f['line']})",
            f"- **step**: `{f['step']}`",
            f"- **tags**: {' '.join(f['tags']) or '_none_'}",
            f"- **confidence**: {f['confidence']}",
            f"- **suggestedAction**: {f['suggestedAction']}",
            "",
            "<details><summary>error</summary>",
            "",
            "```",
            f["error"],
            "```",
            "",
            "</details>",
            "",
        ]
    return "\n".join(lines) + "\n"


def _render_html(payload: dict) -> str:
    findings = payload["findings"]
    counts = payload["categoryCounts"]
    rows = "".join(
        f'<tr><td><code>{html.escape(c)}</code></td><td style="text-align:right">{counts.get(c, 0)}</td></tr>'
        for c in CATEGORIES
        if counts.get(c)
    )
    items = "".join(
        f"""
<details><summary><strong>{html.escape(f['category'])}</strong> - {html.escape(f['scenario'])} ({html.escape(f['feature'])}:{f['line']})</summary>
<p><em>step:</em> <code>{html.escape(f['step'])}</code></p>
<p><em>suggestedAction:</em> {html.escape(f['suggestedAction'])}</p>
<pre>{html.escape(f['error'])}</pre>
</details>
"""
        for f in findings
    )
    return f"""<!doctype html>
<html><head><meta charset="utf-8"><title>Failure Analysis</title>
<style>body{{font-family:system-ui,sans-serif;max-width:60rem;margin:2rem auto;padding:0 1rem;color:#222}}
table{{border-collapse:collapse;margin:1rem 0}}td,th{{padding:.3rem .8rem;border:1px solid #ddd}}
details{{margin:.6rem 0}}pre{{background:#f6f8fa;padding:.6rem;overflow:auto;font-size:12px}}</style></head>
<body><h1>Failure Analysis</h1>
<p>Generated <code>{html.escape(payload['generatedAt'])}</code></p>
<h2>Category breakdown</h2><table><tr><th>Category</th><th>Count</th></tr>{rows}</table>
<h2>Findings ({len(findings)})</h2>{items}
</body></html>
"""


# ---------------------------------------------------------------------------
# propose-fix
# ---------------------------------------------------------------------------

_FIX_TEMPLATES = {
    "ASSERTION_DRIFT": (
        "Step 1. Confirm whether the test or the production code is right.\n"
        "Step 2. If the rule/adjudicator math changed intentionally, update the\n"
        "        scenario's `match` line(s) - quote the field name explicitly\n"
        "        in the commit message.\n"
        "Step 3. If the test was right, do NOT silently weaken it; fix the\n"
        "        production code.\n"
    ),
    "CONTRACT_DRIFT": (
        "Step 1. Diff the OpenAPI spec against the failing route.\n"
        "Step 2. Update whichever side drifted; never weaken the assertion.\n"
        "Step 3. Re-run `python -m tools.cli scaffold from-openapi --tag claims`\n"
        "        if the spec changed.\n"
    ),
    "ENV_CONNECTIVITY": (
        "Step 1. Run `python -m tools.cli doctor`.\n"
        "Step 2. Start the Node service: `cd server; npm install; npm start`.\n"
        "Step 3. Re-run the suite once `/health` returns 200.\n"
    ),
    "DATA_SETUP": (
        "Step 1. Read the request body the scenario sent.\n"
        "Step 2. Confirm the referenced ids (member/provider/encounter/procedure)\n"
        "        are in `server/data/seed-data.json` or were created earlier in\n"
        "        the scenario.\n"
        "Step 3. If the validator changed, update OpenAPI and the test together.\n"
    ),
    "RULE_LOGIC": (
        "Step 1. Inspect `alert.evidence` from the failing scenario.\n"
        "Step 2. Compare with the rule's guardrail conditions in\n"
        "        `docs/business-rules.md`.\n"
        "Step 3. If the rule is correct, the test's seeded history is wrong;\n"
        "        if the test is correct, the rule's guardrail leaks.\n"
    ),
    "INTENTIONAL_DEMO": (
        "DO NOT 'fix' this scenario. It is intentionally failing under the\n"
        "@intentional-failure / @demo-failure tag set so the failure-analyzer\n"
        "demo has something to categorise.\n"
    ),
    "UNCLASSIFIED": (
        "Step 1. Re-read the failing step manually.\n"
        "Step 2. If the cause is genuinely novel, file a follow-up to extend\n"
        "        the categoriser in `tools/agents/failure_analyzer.py`.\n"
    ),
}


def propose_fix(
    failure_report: Optional[str] = None,
    out: Optional[str] = None,
    emit_patches: bool = False,
) -> int:
    src = Path(failure_report) if failure_report else paths.REPORTS_DIR / "ai-failure-analysis.json"
    if not src.is_file():
        p.fail(f"Failure report missing: {src}")
        p.warn("Run `python -m tools.cli analyze` first.")
        return 2
    data = json.loads(src.read_text(encoding="utf-8"))
    findings = data.get("findings") or []

    target = Path(out) if out else paths.REPORTS_DIR / "failure-fix-proposals.md"
    paths.ensure_dir(target.parent)

    p.hr("Fix Proposals (advisory)")
    if not findings:
        target.write_text(
            "# Fix Proposals\n\n_No failing scenarios found in the input report._\n",
            encoding="utf-8",
        )
        p.ok(f"Wrote {paths.safe_rel(target)}")
        return 0

    lines = [
        "# Fix Proposals",
        "",
        "**Advisory only.** This file is never auto-applied. The SDET reads it,",
        "decides whether the test or the production code is right, and edits",
        "the appropriate file by hand.",
        "",
    ]
    for i, f in enumerate(findings, start=1):
        cat = f.get("category", "UNCLASSIFIED")
        lines += [
            f"## {i}. `{cat}` - {f.get('scenario','<unknown>')}",
            "",
            f"- **feature**: `{f.get('feature','?')}` (line {f.get('line',0)})",
            f"- **step**: `{f.get('step','')}`",
            f"- **tags**: {' '.join(f.get('tags', [])) or '_none_'}",
            "",
            "**Proposed fix path**",
            "",
            "```",
            _FIX_TEMPLATES.get(cat, _FIX_TEMPLATES['UNCLASSIFIED']).rstrip(),
            "```",
            "",
        ]
    target.write_text("\n".join(lines) + "\n", encoding="utf-8")
    p.ok(f"Wrote {paths.safe_rel(target)}")

    if emit_patches:
        patches_dir = paths.ensure_dir(paths.PATCHES_DIR)
        for i, f in enumerate(findings, start=1):
            patch = patches_dir / f"finding-{i:02d}.patch"
            patch.write_text(_patch_stub(f), encoding="utf-8")
        p.ok(f"Wrote {len(findings)} advisory patch stubs to {paths.safe_rel(paths.PATCHES_DIR)}/")
    return 0


def _patch_stub(finding: dict) -> str:
    feature = finding.get("feature", "<unknown>")
    return (
        "# advisory-only patch stub - never auto-applied\n"
        f"# scenario: {finding.get('scenario','')}\n"
        f"# category: {finding.get('category','')}\n"
        f"# step:     {finding.get('step','')}\n"
        f"# error:    {finding.get('error','')[:200]}\n"
        f"--- a/{feature}\n"
        f"+++ b/{feature}\n"
        "@@ TODO @@\n"
        "- # current expectation\n"
        "+ # proposed expectation (review before applying)\n"
    )
