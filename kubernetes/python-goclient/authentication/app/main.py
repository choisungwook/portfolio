from fastapi import FastAPI, HTTPException
from kubernetes import client, config
import os


app = FastAPI()

@app.get("/")
def read_root():
    return {"Hello": "World"}

@app.get("/namespaces")
def get_k8s_namespaces():
  try:
    mode = os.getenv("MODE", "local")
    if mode == "local":
      config.load_kube_config()
    else:
      config.load_incluster_config()
  except Exception as e:
    print(f"auth is failed: {e}")
    raise HTTPException(status_code=500, detail={"message": "k8s_auth failed"})

  corev1api = client.CoreV1Api()
  try:
    namespaces_obj = corev1api.list_namespace()
  except client.ApiException as e:
    print(f"Maybe Not authorized. details -> {e}")
    raise HTTPException(status_code=403, detail={"message": "Maybe Not authorized"})

  namespaces = [obj.metadata.name for obj in namespaces_obj.items]
  return {"message": namespaces}
