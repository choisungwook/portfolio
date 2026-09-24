TF_DIR := terraform
TAG ?= v1

ECR_URL      = $(shell terraform -chdir=$(TF_DIR) output -raw ecr_repository_url)
CLUSTER      = $(shell terraform -chdir=$(TF_DIR) output -raw cluster_name)
SERVICE      = $(shell terraform -chdir=$(TF_DIR) output -raw service_name)
CONFIG_BUCKET = $(shell terraform -chdir=$(TF_DIR) output -raw config_bucket)
CONFIG_KEY   = $(shell terraform -chdir=$(TF_DIR) output -raw config_object_key)
REGION       = $(shell terraform -chdir=$(TF_DIR) output -raw region)
IMAGE_PIPELINE  = $(shell terraform -chdir=$(TF_DIR) output -raw image_pipeline_name)
CONFIG_PIPELINE = $(shell terraform -chdir=$(TF_DIR) output -raw config_pipeline_name)

.PHONY: login push config wait watch history url

login:
	aws ecr get-login-password --region $(REGION) | docker login --username AWS --password-stdin $(ECR_URL)

# 버전 tag와 latest를 함께 민다. latest push 이벤트가 파이프라인을 깨우고, 배포에는 버전 tag가 쓰인다.
push: login
	docker buildx build --platform linux/arm64 --provenance=false \
	  --build-arg APP_VERSION=$(TAG) \
	  -t $(ECR_URL):$(TAG) -t $(ECR_URL):latest --push app

# pipeline/config/env.json을 zip으로 올린다. object가 새로 생기면 config 파이프라인이 시작된다.
config:
	cd pipeline/config && zip -q -j - env.json > /tmp/$(CONFIG_KEY)
	aws s3 cp /tmp/$(CONFIG_KEY) s3://$(CONFIG_BUCKET)/$(CONFIG_KEY)

wait:
	aws ecs wait services-stable --cluster $(CLUSTER) --services $(SERVICE)

# 가장 최근 배포의 status와 lifecycle stage를 15초마다 찍는다. Ctrl-C로 끝낸다.
watch:
	@arn=$$(aws ecs list-service-deployments --cluster $(CLUSTER) --service $(SERVICE) --max-results 1 \
	  --query 'serviceDeployments[0].serviceDeploymentArn' --output text); \
	while true; do \
	  aws ecs describe-service-deployments --service-deployment-arns $$arn \
	    --query 'serviceDeployments[0].[status, lifecycleStage, targetServiceRevision.arn]' --output text; \
	  sleep 15; \
	done

history:
	aws ecs list-service-deployments --cluster $(CLUSTER) --service $(SERVICE) \
	  --query 'serviceDeployments[].[createdAt, status, targetServiceRevision.arn]' --output table
	aws codepipeline list-pipeline-executions --pipeline-name $(IMAGE_PIPELINE) \
	  --query 'pipelineExecutionSummaries[].[startTime, status, trigger.triggerType]' --output table
	aws codepipeline list-pipeline-executions --pipeline-name $(CONFIG_PIPELINE) \
	  --query 'pipelineExecutionSummaries[].[startTime, status, trigger.triggerType]' --output table

url:
	@terraform -chdir=$(TF_DIR) output -raw production_url; echo
	@terraform -chdir=$(TF_DIR) output -raw test_url; echo
