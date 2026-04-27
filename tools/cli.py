"""Single Typer entry point for the AI/SDET tooling layer.

Usage:
    python -m tools.cli doctor
    python -m tools.cli run-smoke
    python -m tools.cli explain <topic>
    python -m tools.cli analyze
    python -m tools.cli propose-fix --failure-report reports/ai-failure-analysis.json
    python -m tools.cli scaffold from-openapi --spec docs/openapi/claims-api.yaml --tag claims
    python -m tools.cli scaffold from-rule --rule FRAUD_DUPLICATE_CLAIM
    python -m tools.cli scaffold suggest
"""

from __future__ import annotations

import typer

from .agents import setup_doctor, failure_analyzer, karate_scaffold

app = typer.Typer(
    add_completion=False,
    no_args_is_help=True,
    help="AI/SDET tooling for the Claims Analytics Sandbox.",
)

scaffold_app = typer.Typer(
    add_completion=False,
    no_args_is_help=True,
    help="Karate scaffold generator (Agent 3).",
)
app.add_typer(scaffold_app, name="scaffold")


# ---------------------------------------------------------------------------
# Agent 1 - Setup Doctor / Troubleshooting
# ---------------------------------------------------------------------------
@app.command()
def doctor() -> None:
    """Check Java/Maven/Node/npm, ports, project structure, env."""
    raise typer.Exit(code=setup_doctor.run_doctor())


@app.command("run-smoke")
def run_smoke() -> None:
    """Run the @smoke Karate tag (assumes the Node service is running)."""
    raise typer.Exit(code=setup_doctor.run_smoke())


@app.command()
def explain(
    topic: str = typer.Argument(
        ...,
        help="setup | rules | tags | reports | agents | tools | troubleshooting",
    )
) -> None:
    """Print a curated docs section for the given topic."""
    raise typer.Exit(code=setup_doctor.explain(topic))


# ---------------------------------------------------------------------------
# Agent 2 - Failure Analyzer (with conservative fix-proposal capability)
# ---------------------------------------------------------------------------
@app.command()
def analyze(
    karate_reports: str = typer.Option(
        "target/karate-reports", help="Karate reports dir."
    ),
    surefire_reports: str = typer.Option(
        "target/surefire-reports", help="Surefire reports dir (optional)."
    ),
    server_log: str = typer.Option("", help="Optional server log path."),
) -> None:
    """Parse Karate output and emit reports/ai-failure-analysis.{md,json,html}."""
    raise typer.Exit(
        code=failure_analyzer.analyze(
            karate_reports=karate_reports,
            surefire_reports=surefire_reports,
            server_log=server_log,
        )
    )


@app.command("propose-fix")
def propose_fix(
    failure_report: str = typer.Option(
        "reports/ai-failure-analysis.json",
        help="Input failure report (output of `analyze`).",
    ),
    out: str = typer.Option(
        "reports/failure-fix-proposals.md", help="Markdown output path."
    ),
    emit_patches: bool = typer.Option(
        False, help="Emit advisory diff stubs to reports/patches/ (never auto-applied)."
    ),
) -> None:
    """Conservative fix proposals. NEVER auto-applies any change."""
    raise typer.Exit(
        code=failure_analyzer.propose_fix(
            failure_report=failure_report,
            out=out,
            emit_patches=emit_patches,
        )
    )


# ---------------------------------------------------------------------------
# Agent 3 - Karate Scaffold Generator
# ---------------------------------------------------------------------------
@scaffold_app.command("from-openapi")
def scaffold_from_openapi(
    spec: str = typer.Option(
        "docs/openapi/claims-api.yaml", help="Path to OpenAPI YAML."
    ),
    tag: str = typer.Option("claims", help="Karate tag to apply."),
    out: str = typer.Option("generated/features", help="Output directory."),
) -> None:
    """Generate draft Karate features from an OpenAPI spec."""
    raise typer.Exit(code=karate_scaffold.from_openapi(spec=spec, tag=tag, out=out))


@scaffold_app.command("from-rule")
def scaffold_from_rule(
    rule: str = typer.Option(..., help="Rule code (e.g. FRAUD_DUPLICATE_CLAIM)."),
    out: str = typer.Option("generated/features", help="Output directory."),
) -> None:
    """Generate a draft feature for one rule (positive + guardrail)."""
    raise typer.Exit(code=karate_scaffold.from_rule(rule=rule, out=out))


@scaffold_app.command("suggest")
def scaffold_suggest() -> None:
    """Compute coverage gap and write reports/test-generation-plan.md."""
    raise typer.Exit(code=karate_scaffold.suggest())


def main() -> None:
    app()


if __name__ == "__main__":
    main()
