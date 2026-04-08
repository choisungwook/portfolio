import uvicorn
from main import app

app.state.enable_warmup = True

if __name__ == "__main__":
  uvicorn.run(app, host="0.0.0.0", port=8000)
