# Call Bedrock through Mantle

Prepare the environment with [1-setup.md](./1-setup.md). These commands use the OpenAI Python SDK but authenticate to Amazon Bedrock and send requests to `bedrock-mantle.us-east-1.api.aws`.

## Confirm the destination

Set the Bedrock Mantle base URL and a Bedrock API key.

```bash
export OPENAI_BASE_URL="https://bedrock-mantle.us-east-1.api.aws/v1"
export OPENAI_API_KEY="<BEDROCK_API_KEY>"
```

An OpenAI platform key with this base URL is invalid. Changing the base URL to `https://api.openai.com/v1` would contact OpenAI instead of AWS and changes both the trust boundary and payer.

## List Mantle models

Call the OpenAI-compatible Models API.

```bash
uv run python -m scripts.list_mantle_models
```

Success means OpenAI-shaped model entries are returned. This list is the discovery source for the configured Mantle Region.

## Generate text

Call the OpenAI-compatible Responses API.

```bash
uv run python -m scripts.complete_mantle \
  --model-id openai.gpt-oss-20b \
  "Explain Amazon Bedrock Mantle in one sentence."
```

Success means one sentence is printed. The example sends `store=False`; Mantle therefore does not retain the response for stateful continuation. The inference tokens are billed by AWS.

## What this does not test

- Image generation remains in the Runtime hands-on because the selected image model uses InvokeModel.
- A Runtime model ID is not assumed to work on Mantle. Model and endpoint compatibility must be checked separately.
- A Global prefix is not added to `openai.gpt-oss-20b`; its model card does not publish a Global inference ID.

## Offline verification

Run tests that replace the OpenAI client with a fake client.

```bash
uv run pytest tests/test_mantle_api.py
```

Success means all Mantle tests pass without an AWS request.

## References

- [Inference using Responses API](https://docs.aws.amazon.com/bedrock/latest/userguide/bedrock-mantle.html)
- [Get a list of models](https://docs.aws.amazon.com/bedrock/latest/userguide/models-get-info.html)
- [Amazon Bedrock API keys](https://docs.aws.amazon.com/bedrock/latest/userguide/api-keys-reference.html)
