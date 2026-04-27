"""Provider-agnostic LLM adapter.

Default: disabled. The framework runs fully offline without keys.

Activation:
    LLM_ENABLED=true
    LLM_PROVIDER=openai|anthropic|local

Provider-specific env (only the relevant ones are read):
    OPENAI_API_KEY, OPENAI_BASE_URL, OPENAI_MODEL
    ANTHROPIC_API_KEY, ANTHROPIC_BASE_URL, ANTHROPIC_MODEL
    LOCAL_BASE_URL          (e.g. http://localhost:11434/v1 for Ollama
                             or http://localhost:1234/v1 for LM Studio)
    LOCAL_MODEL

Phase 0 ships a no-op surface so callers can write
``if is_llm_enabled(): ...`` from day one without an SDK installed.
Real provider calls land in Phase 7 (Failure Analyzer enrichment) and
Phase 8 (scaffold variant extrapolation).
"""

from __future__ import annotations

import os
from dataclasses import dataclass
from typing import Optional


def is_llm_enabled() -> bool:
    return os.getenv("LLM_ENABLED", "false").strip().lower() in {"1", "true", "yes"}


def configured_provider() -> Optional[str]:
    return os.getenv("LLM_PROVIDER", "openai").strip().lower() or None


@dataclass(frozen=True)
class LLMConfig:
    provider: str
    api_key: Optional[str]
    base_url: Optional[str]
    model: Optional[str]


def load_config() -> Optional[LLMConfig]:
    if not is_llm_enabled():
        return None
    provider = configured_provider() or "openai"
    if provider == "openai":
        return LLMConfig(
            provider="openai",
            api_key=os.getenv("OPENAI_API_KEY"),
            base_url=os.getenv("OPENAI_BASE_URL"),
            model=os.getenv("OPENAI_MODEL", "gpt-4o-mini"),
        )
    if provider == "anthropic":
        return LLMConfig(
            provider="anthropic",
            api_key=os.getenv("ANTHROPIC_API_KEY"),
            base_url=os.getenv("ANTHROPIC_BASE_URL"),
            model=os.getenv("ANTHROPIC_MODEL", "claude-3-5-sonnet-latest"),
        )
    if provider == "local":
        return LLMConfig(
            provider="local",
            api_key=None,
            base_url=os.getenv("LOCAL_BASE_URL", "http://localhost:11434/v1"),
            model=os.getenv("LOCAL_MODEL", "llama3.1"),
        )
    return None


def chat(prompt: str, system: str = "") -> str:  # pragma: no cover - stub
    """Phase 0 stub. Real provider calls land in Phase 7."""
    raise NotImplementedError("LLM chat lands in Phase 7")
