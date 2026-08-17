# Call Bedrock without Mantle

Prepare the environment with [1-setup.md](./1-setup.md). These commands use boto3 with the AWS-native Bedrock control and Runtime endpoints.

## List text models

List the text-output model catalog in `us-east-1`.

```bash
uv run python -m scripts.list_runtime_models --region us-east-1
```

Success means model IDs are printed. `ListFoundationModels` describes the regional catalog; a successful inference call is the final access test.

## Generate text in one Region

Call the model-independent Converse API with an In-Region model ID.

```bash
uv run python -m scripts.complete_runtime \
  --region us-east-1 \
  --model-id amazon.nova-micro-v1:0 \
  "Explain Amazon Bedrock in one sentence."
```

Success means one sentence is printed. This call creates token usage in the authenticated AWS account.

## Compare Geographic and Global routing

Use the published Geographic profile ID for Claude Sonnet 4.5.

```bash
uv run python -m scripts.complete_runtime \
  --region us-east-1 \
  --model-id us.anthropic.claude-sonnet-4-5-20250929-v1:0 \
  "Reply with the word geo."
```

Use the published Global profile ID while keeping the same source endpoint Region.

```bash
uv run python -m scripts.complete_runtime \
  --region us-east-1 \
  --model-id global.anthropic.claude-sonnet-4-5-20250929-v1:0 \
  "Reply with the word global."
```

Both commands still create a boto3 client in `us-east-1`. Only the inference profile changes the allowed processing destinations. If an SCP denies a destination Region, a cross-Region request can fail even when `us-east-1` is allowed.

## Generate an image

Generate one Nova Canvas image with InvokeModel.

```bash
uv run python -m scripts.generate_image_runtime \
  --region us-east-1 \
  --model-id amazon.nova-canvas-v1:0 \
  --output output.png \
  "A small yellow submarine drawn as a clean technical cutaway, white background."
```

Success means `output.png` exists and opens as a 1024×1024 image. This call creates image-generation usage in the authenticated AWS account.

## Offline verification

Run tests that replace boto3 clients with fake clients.

```bash
uv run pytest tests/test_runtime_api.py
```

Success means all Runtime tests pass without an AWS request.

## References

- [APIs supported by Amazon Bedrock](https://docs.aws.amazon.com/bedrock/latest/userguide/apis.html)
- [Invoke Nova Canvas with boto3](https://docs.aws.amazon.com/bedrock/latest/userguide/bedrock-runtime_example_bedrock-runtime_InvokeModel_AmazonNovaImageGeneration_section.html)
- [Claude Sonnet 4.5 model card](https://docs.aws.amazon.com/bedrock/latest/userguide/model-card-anthropic-claude-sonnet-4-5.html)
