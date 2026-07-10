# 준비: 인프라와 무인증 컨테이너

TL;DR: 인프라를 만들고 세 이미지를 registry에 올린 뒤, EC2 안에서 무인증 컨테이너와 Hurl gate를 띄운다. 여기까지가 준비이고, 이후 [4-auth-token.md](./4-auth-token.md)부터 인증을 강화한다.

로컬에 Terraform, AWS CLI, Session Manager plugin, Docker가 필요하다. [1-scenario.md](./1-scenario.md)와 [2-concepts.md](./2-concepts.md)를 먼저 읽는다. 작업 루트는 `aws/elasticache-authentication`이다.

## 1. 인프라 생성

EC2 앱 호스트와 무인증 Valkey를 만든다.

```bash
terraform -chdir=terraform init
terraform -chdir=terraform apply
terraform -chdir=terraform output
```

`output`의 값은 EC2 안에서 컨테이너에 넘길 때 쓰므로 켜 둔다.

## 2. 이미지 빌드와 푸시

세 단계 앱을 하나의 registry에 tag로 구분해 올린다. 본인 Docker Hub 계정을 쓰려면 `REGISTRY`를 덮어쓴다.

```bash
docker login
make create-builder
make build-push          # REGISTRY=<계정>/<repo> 로 재정의 가능
```

`noauth-1.0.0`, `auth-1.0.0`, `iam-1.0.0` tag가 올라간다.

## 3. EC2 접속

앱 호스트에는 inbound가 없다. SSM Session Manager로 접속한다. user_data가 Docker와 Hurl을 설치하므로 apply 후 1~2분 기다린다.

```bash
aws ssm start-session --target "$(terraform -chdir=terraform output -raw app_instance_id)"
```

컨테이너 실행과 Hurl gate는 각각 별도 SSM 세션에서 돌린다. 같은 인스턴스에 세션을 여러 개 열 수 있다.

## 4. Hurl 파일 준비

EC2 안에서 gate가 쓸 파일을 만든다. 세 파일은 저장소 `hurl/`과 같다.

```bash
mkdir -p ~/hurl
cat > ~/hurl/cache-seed.hurl <<'EOF'
PUT http://127.0.0.1:{{server_port}}/cache/k
Content-Type: application/json
{
  "value": "v"
}
HTTP 204

GET http://127.0.0.1:{{server_port}}/cache/k
HTTP 200
[Asserts]
jsonpath "$.key" == "k"
jsonpath "$.value" == "v"
EOF
cat > ~/hurl/cache-read.hurl <<'EOF'
GET http://127.0.0.1:{{server_port}}/cache/k
HTTP 200
[Asserts]
jsonpath "$.key" == "k"
jsonpath "$.value" == "v"
EOF
cat > ~/hurl/cache-rejected.hurl <<'EOF'
GET http://127.0.0.1:{{server_port}}/cache/k
HTTP *
[Asserts]
status >= 500
status < 600
EOF
```

## 5. 무인증 컨테이너 실행

기존 운영 앱 역할의 무인증 컨테이너를 8080에 띄운다. endpoint는 로컬 `terraform output` 값을 붙여 넣는다. 동적 값만 환경변수로 주입한다.

```bash
export ELASTICACHE_ENDPOINT="<terraform output elasticache_primary_endpoint>"
sudo docker run -d --name noauth -p 8080:8080 \
  -e ELASTICACHE_ENDPOINT="$ELASTICACHE_ENDPOINT" \
  choisunguk/elasticache-auth-client:noauth-1.0.0
```

앱이 뜨면 컨테이너가 실 endpoint로 직접 TLS 연결한다. 같은 VPC라 hostname이 그대로 맞아 port forwarding이나 `/etc/hosts` 수정이 필요 없다.

## 6. Hurl gate 실행

별도 SSM 세션에서 8080 gate를 시작한다. cache 값을 넣은 뒤 gate가 돌기 시작하면, 첫 HTTP·assertion 오류에서 반복이 끝난다.

```bash
export APP_PORT=8080
hurl --retry 3 --retry-interval 1s \
  --variable server_port="$APP_PORT" ~/hurl/cache-seed.hurl
while hurl --no-output \
  --variable server_port="$APP_PORT" ~/hurl/cache-seed.hurl; do
  sleep 0.2
done
```

Terraform 변경 중 이 gate가 계속 돌아야 Redis 오류가 0건이다. gate가 스스로 끝나면 다음 변경을 멈추고 컨테이너 로그와 ElastiCache 이벤트를 확인한다.

무인증 컨테이너, gate가 모두 돌면 준비가 끝난다. 실습을 마치면 `terraform -chdir=terraform destroy`로 정리한다.
