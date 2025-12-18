up:
	talosctl cluster create --name cilium --config-patch @talos-config.yaml --skip-k8s-node-readiness-check

update-kubeconfig:
	talosctl kubeconfig --name cilium --output ./kubeconfig

down:
	talosctl cluster destroy --name cilium


clean:
	kubectl config get-contexts | grep cilium | awk '{print $2}' | xargs -I {} kubectl config delete-context {}
	talosctl config contexts | grep cilium | xargs -I {} talosctl config remove {}
