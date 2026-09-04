# Tauri 2와 PDF.js 기반 데스크톱 앱

## 결정

- Tauri 2 + Rust + Vanilla TypeScript + PDF.js 사용

## 이유

- Chromium을 번들하지 않고 설치 크기와 기본 메모리 사용량 절감
- PDF 렌더링, 텍스트 계층, 목차 탐색을 검증된 웹 엔진에 위임
- WebView2, WKWebView, WebKitGTK를 플랫폼별 검증 대상으로 유지
