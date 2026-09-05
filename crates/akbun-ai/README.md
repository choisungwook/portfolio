# akbun-ai

Tauri에 의존하지 않는 Codex App Server 프로세스와 앱 소유 AI 세션 저장소.

- `product/akbun-makepresentation`과 `product/akbun-makevideo`가 공유함
- 세션은 앱 데이터의 `ai/sessions/`에 저장함
- 세션 수와 용량, 이미지 원본 경로를 Rust 경계에서 검증함

```bash
cargo test --manifest-path crates/akbun-ai/Cargo.toml
```
