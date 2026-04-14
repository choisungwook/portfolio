import json

SYSTEM = (
  "You are a Kubernetes engineer. Always include app label, "
  "resources.limits, and resources.requests for every container."
)


def sample(user_msg, name, image, replicas, port, cpu_req, mem_req, cpu_lim, mem_lim):
  assistant = (
    f"apiVersion: apps/v1\n"
    f"kind: Deployment\n"
    f"metadata:\n"
    f"  name: {name}\n"
    f"  labels:\n"
    f"    app: {name}\n"
    f"spec:\n"
    f"  replicas: {replicas}\n"
    f"  selector:\n"
    f"    matchLabels:\n"
    f"      app: {name}\n"
    f"  template:\n"
    f"    metadata:\n"
    f"      labels:\n"
    f"        app: {name}\n"
    f"    spec:\n"
    f"      containers:\n"
    f"      - name: {name}\n"
    f"        image: {image}\n"
    f"        ports:\n"
    f"        - containerPort: {port}\n"
    f"        resources:\n"
    f"          requests:\n"
    f"            cpu: {cpu_req}\n"
    f"            memory: {mem_req}\n"
    f"          limits:\n"
    f"            cpu: {cpu_lim}\n"
    f"            memory: {mem_lim}\n"
  )
  return {
    "messages": [
      {"role": "system", "content": SYSTEM},
      {"role": "user", "content": user_msg},
      {"role": "assistant", "content": assistant},
    ]
  }


training_examples = [
  sample(
    "Create a Deployment for nginx with 3 replicas on port 80",
    "nginx",
    "nginx:1.27",
    3,
    80,
    "100m",
    "128Mi",
    "500m",
    "256Mi",
  ),
  sample(
    "Deploy redis with 1 replica on port 6379",
    "redis",
    "redis:7.2",
    1,
    6379,
    "100m",
    "128Mi",
    "500m",
    "256Mi",
  ),
  sample(
    "Create a Deployment for httpd with 2 replicas on port 80",
    "httpd",
    "httpd:2.4",
    2,
    80,
    "100m",
    "128Mi",
    "500m",
    "256Mi",
  ),
  sample(
    "Deploy busybox with 1 replica on port 8080",
    "busybox",
    "busybox:1.36",
    1,
    8080,
    "50m",
    "64Mi",
    "200m",
    "128Mi",
  ),
  sample(
    "Create a Deployment for postgres with 1 replica on port 5432",
    "postgres",
    "postgres:16",
    1,
    5432,
    "200m",
    "256Mi",
    "1",
    "512Mi",
  ),
  sample(
    "Deploy mysql with 1 replica on port 3306",
    "mysql",
    "mysql:8.0",
    1,
    3306,
    "200m",
    "256Mi",
    "1",
    "512Mi",
  ),
  sample(
    "Create a Deployment for alpine with 2 replicas on port 8000",
    "alpine",
    "alpine:3.19",
    2,
    8000,
    "50m",
    "64Mi",
    "200m",
    "128Mi",
  ),
  sample(
    "Deploy nodejs app with 3 replicas on port 3000",
    "nodejs-app",
    "node:20",
    3,
    3000,
    "100m",
    "128Mi",
    "500m",
    "256Mi",
  ),
  sample(
    "Create a Deployment for python app with 2 replicas on port 5000",
    "python-app",
    "python:3.12",
    2,
    5000,
    "100m",
    "128Mi",
    "500m",
    "256Mi",
  ),
  sample(
    "Deploy memcached with 1 replica on port 11211",
    "memcached",
    "memcached:1.6",
    1,
    11211,
    "100m",
    "128Mi",
    "500m",
    "256Mi",
  ),
]

with open("k8s_training_data.jsonl", "w") as f:
  for example in training_examples:
    f.write(json.dumps(example) + "\n")

print("Training data created: k8s_training_data.jsonl")
print(f"Total examples: {len(training_examples)}")
