CERT_DIR := ./certs

.PHONY: create-key clean

create-key:
	@mkdir -p $(CERT_DIR)
	@openssl req -x509 -newkey rsa:4096 -nodes -out $(CERT_DIR)/ca.crt -keyout $(CERT_DIR)/ca.key -days 365 -config ./cert.cnf -extensions req_ext

set-up:
	@kubectl create secret tls webhook-certs --cert=certs/ca.crt --key=certs/ca.key --namespace=default
	@kubectl apply -f ./admission-controller-deployment.yaml --namespace=default
	@kubectl wait --for=condition=available --timeout=60s deployment/admission-controller --namespace=default
	@kubectl apply -f ./mutate-webhook.yaml

clean:
	@-kubectl delete -f ./nginx_deployment.yaml --namespace=default
	@-kubectl delete -f ./admission-controller-deployment.yaml --namespace=default
	@-kubectl delete -f mutate-webhook.yaml
	@-kubectl delete secret webhook-certs --namespace=default
