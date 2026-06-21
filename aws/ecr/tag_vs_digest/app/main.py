from fastapi import FastAPI

from version import IMAGE_MESSAGE

app = FastAPI()


@app.get("/")
def read_root() -> dict[str, str]:
  return {"message": IMAGE_MESSAGE}
