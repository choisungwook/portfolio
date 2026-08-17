# Set up the Bedrock model inference hands-on

## Prerequisites

- macOS with `uv` and AWS CLI installed
- An AWS identity allowed to list and invoke Amazon Bedrock models
- A Bedrock API key for the Mantle examples
- Region `us-east-1`

The AWS-native examples use the standard boto3 credential chain. The Mantle examples use a Bedrock API key through `OPENAI_API_KEY`; do not insert an OpenAI platform key.

## Up

Install the Python environment from the workspace root.

```bash
make up
```

Authenticate the AWS CLI with the method used by your account, then export the Mantle variables.

```bash
export OPENAI_BASE_URL="https://bedrock-mantle.us-east-1.api.aws/v1"
export OPENAI_API_KEY="<BEDROCK_API_KEY>"
```

## Down

No local service remains after a script exits.

```bash
make down
```
