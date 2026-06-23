IMAGE_NAME ?= nextjs-env-secret-demo
IMAGE_TAG ?= local
KIND_CLUSTER ?= nextjs-env-secret
NAMESPACE ?= nextjs-env-secret
BUILD_ENV ?= local-build

.PHONY: build-image create_kind delete_kind load-image deploy-local port-forward curl-local rollout-local-secret down

build-image:
	docker build --build-arg NEXT_PUBLIC_BUILD_ENV_NAME=$(BUILD_ENV) -t $(IMAGE_NAME):$(IMAGE_TAG) ./app

create_kind:
	kind create cluster --name $(KIND_CLUSTER) --config ./kind/kind-config.yaml

delete_kind:
	kind delete cluster --name $(KIND_CLUSTER)

load-image:
	kind load docker-image $(IMAGE_NAME):$(IMAGE_TAG) --name $(KIND_CLUSTER)

deploy-local:
	kubectl apply -f ./manifests/local
	kubectl rollout status deployment/nextjs-env-secret-demo -n $(NAMESPACE)

port-forward:
	kubectl port-forward service/nextjs-env-secret-demo 3000:80 -n $(NAMESPACE)

curl-local:
	curl -s http://localhost:3000/api/env | jq .

rollout-local-secret:
	kubectl apply -f ./manifests/local-updates/secret-v2.yaml
	kubectl rollout restart deployment/nextjs-env-secret-demo -n $(NAMESPACE)
	kubectl rollout status deployment/nextjs-env-secret-demo -n $(NAMESPACE)

down:
	kubectl delete -f ./manifests/local --ignore-not-found
