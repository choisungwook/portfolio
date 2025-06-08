create_db:
	@echo "Creating database..."
	@-kubectl delete -f ./kubernetes_manifests/create_mysql_database_job.yaml
	@kubectl apply -f ./kubernetes_manifests/create_mysql_database_job.yaml
