COMPOSE ?= docker compose
KUBECTL ?= kubectl
NAMESPACE ?= vllm-local
MODEL_ID ?= Qwen/Qwen3-0.6B
DEVICE_PLUGIN_VERSION ?= v0.17.1

.PHONY: up down logs health chat k3s-device-plugin k3s-apply k3s-delete k3s-wait k3s-logs k3s-port-forward

up:
	$(COMPOSE) up -d

down:
	$(COMPOSE) down

logs:
	$(COMPOSE) logs -f vllm

health:
	curl -fsS http://localhost:8000/health

chat:
	curl -fsS http://localhost:8000/v1/chat/completions \
		-H "Content-Type: application/json" \
		-d '{"model":"$(MODEL_ID)","messages":[{"role":"user","content":"vLLM을 한 문장으로 설명해줘"}],"max_tokens":64}'

k3s-device-plugin:
	$(KUBECTL) apply -f https://raw.githubusercontent.com/NVIDIA/k8s-device-plugin/$(DEVICE_PLUGIN_VERSION)/deployments/static/nvidia-device-plugin.yml

k3s-apply:
	$(KUBECTL) apply -k manifests/k3s

k3s-delete:
	$(KUBECTL) delete -k manifests/k3s

k3s-wait:
	$(KUBECTL) -n $(NAMESPACE) rollout status deployment/vllm-server --timeout=15m

k3s-logs:
	$(KUBECTL) -n $(NAMESPACE) logs -f deployment/vllm-server

k3s-port-forward:
	$(KUBECTL) -n $(NAMESPACE) port-forward svc/vllm-server 8000:8000
