from fastapi import FastAPI
import os
from fastapi.responses import JSONResponse

app = FastAPI()

@app.get("/")
def print_podname():
  pod_name = os.getenv("POD_NAME", "unknown")
  return JSONResponse(content={"pod_name": pod_name})
