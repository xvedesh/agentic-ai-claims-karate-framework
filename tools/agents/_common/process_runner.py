"""Tiny cross-platform subprocess wrapper used by the doctor + run-smoke flows.

We deliberately keep this small. Every subprocess call inside the SDET
tooling routes through ``run()`` so timeouts, error capture, and stdout
encoding behave identically on Windows PowerShell and *nix.
"""

from __future__ import annotations

import os
import shutil
import subprocess
from dataclasses import dataclass
from pathlib import Path
from typing import Optional, Sequence


@dataclass(frozen=True)
class CommandResult:
    cmd: tuple[str, ...]
    returncode: int
    stdout: str
    stderr: str
    timed_out: bool

    @property
    def ok(self) -> bool:
        return self.returncode == 0 and not self.timed_out

    @property
    def combined(self) -> str:
        out = self.stdout or ""
        err = self.stderr or ""
        if err.strip():
            return f"{out}\n--- stderr ---\n{err}".strip()
        return out.strip()


def which(executable: str) -> Optional[str]:
    """Return absolute path to *executable* or ``None`` if not on PATH."""
    found = shutil.which(executable)
    return str(Path(found).resolve()) if found else None


def run(
    cmd: Sequence[str],
    *,
    cwd: Optional[Path] = None,
    timeout: float = 60.0,
    env: Optional[dict] = None,
) -> CommandResult:
    """Run *cmd* and return a :class:`CommandResult`.

    Never raises on non-zero exit; the caller decides what to do with
    ``result.returncode``. ``timeout`` is hard-stopped via the OS.
    """
    cmd_tuple = tuple(cmd)
    full_env = os.environ.copy()
    if env:
        full_env.update(env)
    try:
        proc = subprocess.run(
            cmd_tuple,
            cwd=str(cwd) if cwd else None,
            capture_output=True,
            text=True,
            timeout=timeout,
            env=full_env,
            check=False,
        )
        return CommandResult(
            cmd=cmd_tuple,
            returncode=proc.returncode,
            stdout=proc.stdout or "",
            stderr=proc.stderr or "",
            timed_out=False,
        )
    except subprocess.TimeoutExpired as e:
        return CommandResult(
            cmd=cmd_tuple,
            returncode=124,
            stdout=(e.stdout or b"").decode("utf-8", errors="replace") if isinstance(e.stdout, bytes) else (e.stdout or ""),
            stderr=(e.stderr or b"").decode("utf-8", errors="replace") if isinstance(e.stderr, bytes) else (e.stderr or ""),
            timed_out=True,
        )
    except FileNotFoundError as e:
        return CommandResult(
            cmd=cmd_tuple,
            returncode=127,
            stdout="",
            stderr=f"executable not found: {e}",
            timed_out=False,
        )
