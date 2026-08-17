from client.app import MODEL_GROUPS


def test_model_arguments_map_to_litellm_model_groups() -> None:
  assert MODEL_GROUPS == {
    "qwen": "local-tool-model",
    "bedrock": "bedrock-nova-micro",
  }
