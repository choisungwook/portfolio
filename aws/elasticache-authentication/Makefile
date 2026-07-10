REGISTRY=choisunguk/elasticache-auth-client
VERSION=1.0.0

.PHONY: test create-builder build-push-noauth build-push-auth build-push-iam build-push

test:
	mvn -B -f apps/noauth/pom.xml test
	mvn -B -f apps/auth/pom.xml test
	mvn -B -f apps/iam/pom.xml test

create-builder:
	docker buildx create --name container-builder --driver docker-container --bootstrap --use

build-push-noauth:
	docker buildx build --platform linux/amd64,linux/arm64 -t $(REGISTRY):noauth-$(VERSION) --push apps/noauth

build-push-auth:
	docker buildx build --platform linux/amd64,linux/arm64 -t $(REGISTRY):auth-$(VERSION) --push apps/auth

build-push-iam:
	docker buildx build --platform linux/amd64,linux/arm64 -t $(REGISTRY):iam-$(VERSION) --push apps/iam

build-push: build-push-noauth build-push-auth build-push-iam
