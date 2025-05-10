from k8s_manager import KubernetesManager
from fastapi import FastAPI, HTTPException
from typing import Dict, Any
import os

app = FastAPI(
  title="Kubernetes API demo",
  description="Kubernetes API demo",
  version="0.0.1"
)

k8s_manager = KubernetesManager(os.getenv("PROFILE", "local"))

if __name__ == "__main__":
  k8s_manager = KubernetesManager(os.getenv("PROFILE", "local"))
  namespaces = k8s_manager.list_namespaces()
  print(namespaces)


@app.get(
  "/namespaces",
  summary="get all namespaces",
  response_description="get all namespaces",
  tags=["Namespaces"]
)
async def get_namespaces() -> Dict[str, Any]:
  """
  Get kubernetes all namespaces
  """
  try:
    namespaces = await k8s_manager.list_namespaces()

    return {
      "namespaces": namespaces,
      "length": len(namespaces)
    }
  except Exception as e:
    print(f"Api has error: {e}")
    raise HTTPException(status_code=500, detail=f"Internal server error: {str(e)}")
