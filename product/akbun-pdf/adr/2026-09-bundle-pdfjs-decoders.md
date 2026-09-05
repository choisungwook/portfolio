# PDF.js 이미지 decoder 자산 번들

## 결정

- PDF.js의 JBIG2·OpenJPEG·QCMS WASM과 fallback 자산을 앱 번들에 포함
- decoder 자산의 원래 파일명을 유지하고 같은 디렉터리에서 제공

## 이유

- 스캔 PDF의 이미지 압축 방식에 따라 별도 decoder가 필요함
- PDF.js는 설정한 디렉터리 아래에서 고정 파일명으로 decoder를 조회함
- 네트워크 연결 없이 모든 지원 이미지 형식을 렌더링해야 함
