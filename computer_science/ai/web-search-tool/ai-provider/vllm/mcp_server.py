"""Expose SearXNG as vLLM's server-side browser tool."""

import os

import httpx
from fastmcp import FastMCP

mcp = FastMCP(
  "browser",
  instructions="Search the public web and return titles, URLs, and snippets.",
)


@mcp.tool
async def search(query: str) -> dict:
  """Search the public web for current information."""
  print(f"search query={query!r}", flush=True)
  async with httpx.AsyncClient(timeout=20) as client:
    response = await client.get(
      f"{os.getenv('SEARXNG_URL', 'http://searxng:8080').rstrip('/')}/search",
      params={"q": query, "format": "json"},
    )
    response.raise_for_status()
  results = response.json().get("results", [])[:5]
  return {
    "query": query,
    "results": [
      {
        "title": result.get("title", ""),
        "url": result.get("url", ""),
        "snippet": result.get("content", ""),
      }
      for result in results
    ],
  }


if __name__ == "__main__":
  mcp.run(transport="sse", host="0.0.0.0", port=8888, show_banner=False)
