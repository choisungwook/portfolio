# ===== kind =====
kind-up:
	kind create cluster --config kind-config.yaml

kind-down:
	kind delete cluster --name cilium

cilium-install:
	cilium install \
		--version 1.18.5 \
		--set kubeProxyReplacement=true \
		--set hubble.enabled=true \
		--set hubble.relay.enabled=true \
		--set hubble.ui.enabled=true \
		--set ingressController.enabled=true \
		--set ingressController.loadbalancerMode=dedicated

cilium-status:
	cilium status --wait

# ===== talos =====
up:
	talosctl cluster create --name cilium --config-patch @talos-config.yaml --skip-k8s-node-readiness-check

update-kubeconfig:
	talosctl kubeconfig --name cilium --output ./kubeconfig

down:
	talosctl cluster destroy --name cilium

clean:
	kubectl config get-contexts | grep cilium | awk '{print $2}' | xargs -I {} kubectl config delete-context {}
	talosctl config contexts | grep cilium | xargs -I {} talosctl config remove {}
