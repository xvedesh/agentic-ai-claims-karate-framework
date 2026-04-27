"""Layer B - AI/SDET tooling around the Claims Analytics Sandbox.

This package never imports Layer A (the Node claims service) and never
participates in claim adjudication. It only operates on the framework:
checking setup, parsing test reports, and scaffolding draft Karate
features. See docs/ai-sdet-tooling.md for the full contract.
"""

__version__ = "0.1.0"
