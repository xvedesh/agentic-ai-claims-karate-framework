"""Tiny rich-style console printer used by every agent.

Centralised so colours stay consistent across all three tools.
"""

from __future__ import annotations

from rich.console import Console
from rich.table import Table


_console = Console()


def info(msg: str) -> None:
    _console.print(f"[cyan]{msg}[/cyan]")


def ok(msg: str) -> None:
    _console.print(f"[green]+ {msg}[/green]")


def warn(msg: str) -> None:
    _console.print(f"[yellow]! {msg}[/yellow]")


def fail(msg: str) -> None:
    _console.print(f"[red]x {msg}[/red]")


def hr(title: str) -> None:
    _console.rule(title)


def table(headers: list[str], rows: list[list[str]], title: str | None = None) -> None:
    t = Table(title=title)
    for h in headers:
        t.add_column(h)
    for r in rows:
        t.add_row(*r)
    _console.print(t)


def plain(msg: str = "") -> None:
    _console.print(msg)
