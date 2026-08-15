import json

from pydantic import BaseModel


class ModelMetadata(BaseModel):
  id: str
  name: str
  type: str
  framework: str
  version: str
  description: str


class ModelStore:
  def __init__(self, config_path: str):
    self.models: dict[str, ModelMetadata] = {}
    self._load_config(config_path)

  def _load_config(self, config_path: str):
    with open(config_path) as f:
      config = json.load(f)
    for model in config["models"]:
      self.models[model["id"]] = ModelMetadata(**model)

  def get_model(self, model_id: str) -> ModelMetadata | None:
    return self.models.get(model_id)

  def list_models(self) -> dict[str, ModelMetadata]:
    return self.models
