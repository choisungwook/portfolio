.PHONY: up down test validate

up:
	docker compose up -d --build --wait

down:
	docker compose down -v

test:
	uv run --python 3.14 python -m unittest discover -s tests -v
	bash tests/test_deploy.sh

validate:
	terraform fmt -check -recursive foundation workload
	terraform -chdir=foundation validate
	terraform -chdir=workload validate
	terraform -chdir=foundation test
	terraform -chdir=workload test
	bash -n scripts/bootstrap-images.sh scripts/start-pipeline.sh scripts/show-service.sh deploy/deploy.sh deploy/export-taskdef.sh deploy/diff-taskdef.sh
