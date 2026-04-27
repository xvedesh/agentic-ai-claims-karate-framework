"""Tests for the Karate scaffold renderer.

These exercise the deterministic templating without writing files: we
build a synthetic OpenAPI-shaped dict, run the operation extractor and
the renderer, and assert structural properties of the output.
"""

from __future__ import annotations

from tools.agents.karate_scaffold import (
    _operations,
    _path_to_url_template,
    _render_operation_feature,
)


def test_path_template_extracts_params() -> None:
    expr, params = _path_to_url_template("/api/claims/{id}/submit")
    assert params == ["id"]
    assert expr == "'/api/claims/' + id + '/submit'"


def test_operations_collect_path_and_method() -> None:
    spec = {
        "components": {"schemas": {}},
        "paths": {
            "/api/things/{id}": {
                "get": {
                    "operationId": "getThing",
                    "summary": "Fetch a thing",
                    "responses": {"200": {}, "404": {}},
                },
            }
        },
    }
    ops = _operations(spec)
    assert len(ops) == 1
    op = ops[0]
    assert op.method == "GET"
    assert op.operation_id == "getThing"
    assert op.success_status == "200"
    assert "404" in op.error_statuses


def test_render_includes_param_def_and_404_scenario() -> None:
    spec = {
        "components": {"schemas": {}},
        "paths": {
            "/api/things/{id}": {
                "get": {
                    "operationId": "getThing",
                    "summary": "Fetch a thing",
                    "responses": {"200": {}, "404": {}, "401": {}},
                },
            }
        },
    }
    op = _operations(spec)[0]
    text = _render_operation_feature(op, tag="things")

    assert "@scaffold @things @generated" in text
    assert "Feature: GET /api/things/{id}" in text
    assert "* def id = 'TODO-ID'" in text
    assert "Scenario: positive (200)" in text
    assert "Scenario: 401 without bearer token" in text
    assert "Scenario: 404 for an unknown id" in text
    assert "'NOT-FOUND-ID'" in text
