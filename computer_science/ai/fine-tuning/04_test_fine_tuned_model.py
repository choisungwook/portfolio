import os
from openai import OpenAI

api_key = os.getenv("OPENAI_API_KEY", "xxxx")
client = OpenAI(api_key=api_key)

with open("fine_tuned_model_id.txt", "r") as f:
  fine_tuned_model = f.read().strip()

query = "Create a Kubernetes Deployment for nginx with 3 replicas on port 80"

response = client.chat.completions.create(
  model=fine_tuned_model,
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

print("FINE-TUNED MODEL OUTPUT:")
print(response.choices[0].message.content)
