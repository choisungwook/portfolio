import os
import time
from openai import OpenAI

api_key = os.getenv("OPENAI_API_KEY", "xxxx")
client = OpenAI(api_key=api_key)

print("Uploading training data...")
with open("k8s_training_data.jsonl", "rb") as f:
  file_response = client.files.create(file=f, purpose="fine-tune")

print(f"File uploaded: {file_response.id}")

print("Starting fine-tuning job...")
job = client.fine_tuning.jobs.create(
  training_file=file_response.id,
  model="gpt-4.1-nano-2025-04-14",
  suffix="k8s-deploy",
  hyperparameters={"n_epochs": 1},
)

print(f"Fine-tuning job created: {job.id}")
print("Waiting for completion...")

while True:
  job_status = client.fine_tuning.jobs.retrieve(job.id)
  print(f"status: {job_status.status}")

  if job_status.status == "succeeded":
    print(f"Fine-tuning completed: {job_status.fine_tuned_model}")
    with open("fine_tuned_model_id.txt", "w") as f:
      f.write(job_status.fine_tuned_model)
    break
  elif job_status.status in ["failed", "cancelled"]:
    print(f"Fine-tuning {job_status.status}")
    break

  time.sleep(10)
