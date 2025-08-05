.PHONY: up down install-open-webui install-vllm uninstall

up:
	kind create cluster --config kind-config.yaml

down:
	kind delete cluster --name openwebui


install-open-webui:
	helm repo add open-webui https://helm.openwebui.com/
	helm upgrade --install open-webui open-webui/open-webui \
		--namespace open-webui --create-namespace \
		-f ./charts/open-webui/values.yaml

install-ollama:
	helm repo add otwld https://helm.otwld.com/
	helm upgrade --install ollama otwld/ollama \
		--namespace ollama --create-namespace \
		-f ./charts/ollama/values.yaml

install-vllm:
	helm repo add vllm https://vllm-project.github.io/production-stack
	helm upgrade --install vllm vllm/vllm-stack \
		--namespace vllm --create-namespace \
		-f ./charts/vllm/facebook-opt-125m.yaml

uninstall:
	helm uninstall open-webui --namespace open-webui
