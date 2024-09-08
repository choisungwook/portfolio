from fastapi import FastAPI
import os

app = FastAPI()

@app.get("/name")
def get_pod_name():
    pod_name = os.getenv("pod_name", "Unknown Pod")
    return {"pod_name": pod_name}
