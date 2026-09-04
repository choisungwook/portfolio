# 제품별 고정 updater tag

## 결정

- `akbun-pdf-updater` 고정 tag의 `latest.json`을 updater endpoint로 사용

## 이유

- 한 저장소에서 여러 제품을 릴리스하므로 GitHub의 최신 release가 다른 제품을 가리킬 수 있음
- 설치된 앱이 자기 제품의 manifest만 안정적으로 조회
