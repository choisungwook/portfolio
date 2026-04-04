# 배포

## 배포 방법

> 주의: preview.html, preview-post.html은 로컬 미리보기용이므로 업로드하지 않는다.

1. [티스토리 관리자](https://malwareanalysis.tistory.com/manage) 접속
2. 꾸미기 → 스킨 변경
3. 스킨 목록 우측의 **스킨등록 +** 버튼 클릭
4. **추가** 버튼을 눌러 `src/` 폴더 안의 파일을 모두 업로드
   - `skin.html`
   - `style.css`
   - `index.xml`
   - `images/` 폴더 안의 파일도 전부 업로드
5. 저장 → 스킨이름 지정 → 적용

### 구글 서치콘솔 (옵션)

검색 노출에 필요하다. 스킨 저장소에는 넣지 않고, 업로드 후 각자 본인 코드로 추가한다.

```html
<meta name="google-site-verification" content="여기에_발급받은_코드" />
```

### 네이버 서치어드바이저 (옵션)

네이버 검색 노출에 필요하다. [네이버 서치어드바이저](https://searchadvisor.naver.com/)에서 사이트를 등록하면 메타태그를 발급받는다.

```html
<meta name="naver-site-verification" content="여기에_발급받은_코드" />
```

### 구글 애드센스 (옵션)

티스토리 관리자 → 수익 → 애드센스에서 연동하면 티스토리가 자동으로 광고 코드를 삽입한다. skin.html에 직접 넣을 필요 없다.

만약 수동으로 광고 위치를 제어하고 싶다면, `<head>`에 아래 스크립트를 추가한다.

```html
<script async src="https://pagead2.googlesyndication.com/pagead/js/adsbygoogle.js?client=ca-pub-여기에_본인_ID" crossorigin="anonymous"></script>
```

## 배포 후 체크리스트

- [ ] [구글 서치콘솔](https://search.google.com/search-console)에서 소유권 확인 상태 점검
