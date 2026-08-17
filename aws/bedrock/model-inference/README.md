# Amazon Bedrock model inference

This hands-on compares the AWS-native `bedrock-runtime` endpoint with the OpenAI-compatible `bedrock-mantle` endpoint.

## Start here

- Open [studysheet-bedrock-model-inference-v1.html](./studysheet-bedrock-model-inference-v1.html) in a browser.
- Prepare the local environment with [1-setup.md](./docs/1-setup.md).
- Run both API paths with [4-runtime-hands-on.md](./docs/4-runtime-hands-on.md) and [5-mantle-hands-on.md](./docs/5-mantle-hands-on.md).

## Index

| Path | Purpose |
| --- | --- |
| [docs/1-setup.md](./docs/1-setup.md) | Install and remove the local environment |
| [docs/2-endpoints-and-cost.md](./docs/2-endpoints-and-cost.md) | Compare endpoints, routing scopes, and billing |
| [docs/3-playground.md](./docs/3-playground.md) | Test text and image models in the console |
| [docs/4-runtime-hands-on.md](./docs/4-runtime-hands-on.md) | Call Bedrock without Mantle through boto3 |
| [docs/5-mantle-hands-on.md](./docs/5-mantle-hands-on.md) | Call Mantle through the OpenAI SDK |
| [bedrock_examples](./bedrock_examples/) | Small reusable API functions |
| [scripts](./scripts/) | Executable examples |
| [tests](./tests/) | Offline tests for both endpoint families |

Running Playground or a script that invokes a model creates Amazon Bedrock usage in the authenticated AWS account. The offline test suite uses fake clients and does not call AWS.
