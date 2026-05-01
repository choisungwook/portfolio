# Manifests

LangGraph agent loop 핸즈온에서 사용하는 Kubernetes manifest.

## 인덱스

| 디렉터리/파일 | 설명 |
|---|---|
| `broken-nginx.yaml` | 일부러 잘못된 이미지 태그를 가진 Pod. 에이전트가 `kubectl` 도구로 `ImagePullBackOff`를 진단하는 핸즈온에 사용한다. |
