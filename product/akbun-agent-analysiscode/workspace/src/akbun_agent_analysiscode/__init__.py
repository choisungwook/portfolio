"""Agent CLI that learns cross-service relationships from MSA source code."""

from importlib import metadata


def get_version() -> str:
  """Return the installed package version, or a dev marker when not installed."""
  try:
    return metadata.version("akbun-agent-analysiscode")
  except metadata.PackageNotFoundError:
    return "0.0.0-dev"
