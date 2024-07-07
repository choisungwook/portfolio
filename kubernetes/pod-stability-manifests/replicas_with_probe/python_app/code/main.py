from fastapi import FastAPI
import os
import time
from contextlib import asynccontextmanager

@asynccontextmanager
async def lifespan(app: FastAPI):
  """
  의도적으로 15초 지연
  """
  print("Starting up... delay 15 seconds...")
  time.sleep(15)
  print("Starting up... delay is done.")
  yield

app = FastAPI(lifespan=lifespan)

@app.get("/sleep")
def sleep():
  sleep_time = int(os.environ.get("SLEEPTIME", 2))
  time.sleep(sleep_time)
  return {"message": "ok"}

@app.get("/ping")
def ping():
  return {"message": "ok"}
