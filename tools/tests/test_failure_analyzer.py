"""Categoriser tests for the Failure Analyzer.

These exercise the pure-functional core (``_classify``) so we can lock
the deterministic categorisation behaviour without touching disk.
"""

from __future__ import annotations

from tools.agents.failure_analyzer import _classify


def test_intentional_failure_tag_wins() -> None:
    cat, conf = _classify(
        "match failed: EQUALS\n  $ | not equal\n  'DENIED'\n  'PAID'",
        feature="features/_demo/demo_assertion_drift.feature",
        tags=["@intentional-failure", "@demo-failure"],
    )
    assert cat == "INTENTIONAL_DEMO"
    assert conf == "HIGH"


def test_demo_folder_implies_intentional() -> None:
    cat, _ = _classify("anything", feature="features/_demo/x.feature", tags=[])
    assert cat == "INTENTIONAL_DEMO"


def test_connection_refused_is_env_connectivity() -> None:
    cat, conf = _classify(
        "java.net.ConnectException: Connection refused: connect",
        feature="features/happy/claim_lifecycle.feature",
        tags=[],
    )
    assert cat == "ENV_CONNECTIVITY"
    assert conf == "HIGH"


def test_status_drift_is_contract_drift() -> None:
    cat, conf = _classify(
        "status code was: 500, expecting: 200",
        feature="features/happy/claim_lifecycle.feature",
        tags=[],
    )
    assert cat == "CONTRACT_DRIFT"
    assert conf == "HIGH"


def test_match_failed_under_rule_folder_is_rule_logic() -> None:
    cat, _ = _classify(
        "match failed: EQUALS\n  $.adjudication.winningAction | not equal\n  'DENY'\n  'APPROVE'",
        feature="features/fraud/duplicate_claim.feature",
        tags=["@fraud"],
    )
    assert cat == "RULE_LOGIC"


def test_match_failed_outside_rule_folder_is_assertion_drift() -> None:
    cat, _ = _classify(
        "match failed: EQUALS\n  $ | not equal\n  20\n  10",
        feature="features/happy/claim_lifecycle.feature",
        tags=[],
    )
    assert cat == "ASSERTION_DRIFT"


def test_data_setup_recognises_envelope_codes() -> None:
    cat, _ = _classify(
        "expected response.error.code == 'INVALID_REQUEST', got 'INTERNAL_ERROR'",
        feature="features/negative/contract_violations.feature",
        tags=["@negative"],
    )
    assert cat == "DATA_SETUP"


def test_unrecognised_error_is_unclassified() -> None:
    cat, conf = _classify("something nobody has ever seen", feature="x", tags=[])
    assert cat == "UNCLASSIFIED"
    assert conf == "LOW"
