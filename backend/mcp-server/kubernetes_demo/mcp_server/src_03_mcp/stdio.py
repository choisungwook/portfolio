from k8s_manager import KubernetesManager
import os
from typing import Dict, Any
from mcp.server.fastmcp import FastMCP

# Initialize FastMCP server
mcp = FastMCP("kubernetes")

k8s_manager = KubernetesManager(os.getenv("PROFILE", "local"))

@mcp.tool()
async def get_namespaces() -> Dict[str, Any]:
    """
    Get kubernetes all namespaces
    """
    namespaces = await k8s_manager.list_namespaces()

    return {
      "namespaces": namespaces,
      "length": len(namespaces)
    }

if __name__ == "__main__":
    mcp.run(transport='stdio')
