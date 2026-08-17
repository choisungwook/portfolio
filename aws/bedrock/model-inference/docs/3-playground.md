# Test models in the Bedrock playground

## Before running

Every successful generation creates Amazon Bedrock usage in the signed-in AWS account. Select `us-east-1`, use one short prompt, and generate one image to keep the experiment small.

## Text playground

1. Open the Amazon Bedrock console in `us-east-1`.
2. Open the Chat/Text playground.
3. Select an available text model.
4. Enter `Explain the difference between an API endpoint and a model ID in two sentences.`
5. Run the prompt once.

Success means the response is generated and the console shows input and output usage. This proves the console identity can invoke that model through Bedrock; it does not prove that the same model exists on Mantle.

## Image playground

1. Open the Image playground.
2. Select Amazon Nova Canvas.
3. Enter `A small yellow submarine drawn as a clean technical cutaway, white background.`
4. Set the number of images to `1`.
5. Run the prompt once.

Success means one image appears. The equivalent Python example uses `bedrock-runtime` and `InvokeModel`, because native model control and non-text output are Runtime use cases.

## Compare with API discovery

The console model picker, Runtime `ListFoundationModels`, and Mantle `/models` are different discovery surfaces. Treat the returned model ID from each API as authoritative for that endpoint and Region.

## Reference

- [Get started in the Amazon Bedrock console](https://docs.aws.amazon.com/bedrock/latest/userguide/getting-started-console.html)
