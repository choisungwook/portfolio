import os
from openai import OpenAI

api_key = os.getenv("OPENAI_API_KEY", "xxxx")
client = OpenAI(api_key=api_key)

query = "Create a Kubernetes Deployment for nginx with 3 replicas on port 80"

response = client.chat.completions.create(
  model="gpt-4.1-nano-2025-04-14",
  messages=[
    {
      "role": "system",
      "content": "You are a Kubernetes engineer. Generate a Deployment manifest in YAML.",
    },
    {"role": "user", "content": query},
  ],
  max_tokens=300,
  temperature=0.1,
)

print("BASE MODEL OUTPUT:")
print(response.choices[0].message.content)
