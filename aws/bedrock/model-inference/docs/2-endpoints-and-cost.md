# Bedrock endpoints, routing, and cost

## Two inference endpoints

Amazon Bedrock exposes two inference endpoints. They belong to the same AWS service but provide different API surfaces and quotas.

| Endpoint | Primary APIs | Use it when |
| --- | --- | --- |
| `bedrock-runtime.{region}.amazonaws.com` | InvokeModel, Converse, Chat Completions, Messages | A model requires the native endpoint, direct model payload control is needed, or image generation is required |
| `bedrock-mantle.{region}.api.aws` | Responses, Chat Completions, Messages | An OpenAI or Anthropic SDK interface, stateful responses, or Mantle scheduling is preferred |

Mantle is not a replacement name for Amazon Bedrock. It is the distributed inference engine behind the `bedrock-mantle` endpoint. Both endpoints can be used by one application.

The Mantle endpoint is unavailable in `ap-northeast-2` at the time of this hands-on. The examples use `us-east-1`. Always recheck the regional availability page because endpoint and model coverage can change.

## Endpoint Region and inference scope are different controls

The hostname always contains a source AWS Region. There is no generic `bedrock-runtime.global` hostname in this flow.

The `modelId` or inference profile ID selects where Bedrock may process the request.

| Scope | Example ID | Processing boundary | Main reason to choose it |
| --- | --- | --- | --- |
| In-Region | `anthropic.claude-sonnet-4-5-20250929-v1:0` | The source Region | Strict single-Region processing |
| Geographic | `us.anthropic.claude-sonnet-4-5-20250929-v1:0` | Eligible Regions inside the geography | More throughput with a geographic boundary |
| Global | `global.anthropic.claude-sonnet-4-5-20250929-v1:0` | Eligible commercial Regions worldwide | Maximum capacity and no geographic residency requirement |

This request still enters the `us-east-1` Runtime endpoint when a global profile is used:

```text
bedrock-runtime.us-east-1.amazonaws.com
  + modelId=global.anthropic.claude-sonnet-4-5-20250929-v1:0
  -> Bedrock selects an eligible destination Region
```

Inference profiles are model-specific. Do not add `global.` or a geography prefix unless the selected model card publishes that exact ID. The Mantle examples in this workspace use an In-Region model ID because the selected `gpt-oss` model does not publish a Global inference ID.

## Where the charge appears

- Playground and code calls are Amazon Bedrock usage in the AWS account that authorizes the request.
- A Bedrock API key used by the OpenAI SDK still authenticates to AWS. It does not move the charge to an OpenAI account.
- On-demand text models are generally metered by input and output tokens. Image models are generally metered per generated image and configuration.
- The same model has the same per-token price on Runtime and Mantle. Choose the endpoint for API and capability needs.
- Cross-Region inference has no separate routing fee. Pricing is calculated from the source Region; a model can publish different Global pricing.
- Mantle Projects and Workspaces can attribute usage inside the AWS account. They do not create a separate payer.

Check the current pricing page before running the hands-on. Prices and model availability are intentionally not copied into this repository.

## References

- [Endpoints supported by Amazon Bedrock](https://docs.aws.amazon.com/bedrock/latest/userguide/endpoints.html)
- [Regional availability by endpoints](https://docs.aws.amazon.com/bedrock/latest/userguide/endpoints-region-availability.html)
- [Regional availability by models](https://docs.aws.amazon.com/bedrock/latest/userguide/models-region-compatibility.html)
- [Global cross-Region inference](https://docs.aws.amazon.com/bedrock/latest/userguide/global-cross-region-inference.html)
- [Amazon Bedrock pricing](https://aws.amazon.com/bedrock/pricing/)
