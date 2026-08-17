"""Search the web through a SearXNG JSON endpoint."""

from typing import Any

import httpx


def normalize_results(payload: dict[str, Any], max_results: int = 5) -> list[dict[str, str]]:
  """Return compact title, URL, and snippet dictionaries from SearXNG output."""
  results = []
  for item in payload.get("results", [])[:max_results]:
    results.append(
      {
        "title": str(item.get("title", "")),
        "url": str(item.get("url", "")),
        "snippet": str(item.get("content", "")),
      }
    )
  return results


def search_web(query: str, base_url: str, max_results: int = 5) -> list[dict[str, str]]:
  """Query SearXNG and return compact results for an LLM tool response."""
  response = httpx.get(
    f"{base_url.rstrip('/')}/search",
    params={"q": query, "format": "json"},
    timeout=30,
  )
  response.raise_for_status()
  return normalize_results(response.json(), max_results)
