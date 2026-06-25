CLUSTER_NAME ?= kafka-pubsub
IMAGE ?= kafka-pubsub-app:local
NAMESPACE ?= kafka

create_kind:
	kind create cluster --name $(CLUSTER_NAME) --config kind/kind-config.yaml

delete_kind:
	kind delete cluster --name $(CLUSTER_NAME)

build:
	docker build -t $(IMAGE) .

load:
	kind load docker-image $(IMAGE) --name $(CLUSTER_NAME)

deploy:
	kubectl apply -f manifests

wait:
	kubectl -n $(NAMESPACE) wait --for=condition=available deployment/kafka --timeout=180s
	kubectl -n $(NAMESPACE) wait --for=condition=available deployment/kafka-pubsub-app --timeout=180s
	kubectl -n $(NAMESPACE) wait --for=condition=available deployment/prometheus --timeout=180s
	kubectl -n $(NAMESPACE) wait --for=condition=available deployment/grafana --timeout=180s

up: create_kind build load deploy wait

down:
	kubectl delete -f manifests --ignore-not-found=true

port-forward-app:
	kubectl -n $(NAMESPACE) port-forward svc/kafka-pubsub-app 8080:8080

port-forward-prometheus:
	kubectl -n $(NAMESPACE) port-forward svc/prometheus 9090:9090

port-forward-grafana:
	kubectl -n $(NAMESPACE) port-forward svc/grafana 3000:3000
