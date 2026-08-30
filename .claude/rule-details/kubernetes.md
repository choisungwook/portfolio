# Kubernetes Manifest 규칙

## 디렉터리 구조

- 모든 Kubernetes manifest 파일은 `manifests/` 디렉터리에 생성한다.
- YAML 파일이 여러 개인 경우 `manifests/` 안에 주제별 서브폴더를 만든다.
  - 예: `manifests/nginx/`, `manifests/applicationset/`
- YAML 파일이 1~2개로 단순한 경우 서브폴더 없이 `manifests/`에 직접 배치한다.

## manifests/README.md

- `manifests/README.md`에는 예제 설명 인덱스 테이블을 반드시 포함한다.
- 테이블 형식:

```markdown
| 디렉터리/파일 | 설명 |
|---|---|
| `nginx/` | Nginx deployment 예제 |
| `sample.yaml` | 단일 파일 예제 |
```

- 새 manifest를 추가할 때마다 인덱스 테이블을 업데이트한다.

## YAML 작성 규칙

- `apiVersion`, `kind`, `metadata`, `spec` 순서로 작성한다.
- `metadata.labels`에 리소스를 식별할 수 있는 label을 포함한다.
- 리소스 이름은 용도를 알 수 있도록 명확하게 작성한다.
- 하나의 YAML 파일에 하나의 리소스를 정의한다. 여러 리소스를 묶지 않는다.
- container에는 `resources.limits`와 `resources.requests`를 명시한다.

## 네이밍 규칙

- 파일명은 소문자, 하이픈(`-`) 구분을 사용한다. 예: `nginx-deployment.yaml`
- 리소스 이름도 소문자, 하이픈 구분을 따른다. 예: `name: nginx-deployment`
