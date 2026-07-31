# OkzMongo

Tauri v2 + React 19로 만든 MongoDB GUI 클라이언트.

**다른 언어:**
[日本語](README.md) | [English](README.en.md) | [中文（简体）](README.zh-CN.md) | [中文（繁體）](README.zh-TW.md)

---

## 기능

- MongoDB 연결 / 해제 (여러 연결 설정 관리)
- 데이터베이스 / 컬렉션 트리 뷰
- 문서 목록 및 페이지 탐색 (페이지당 50건)
- 문서 추가, 편집, 삭제
- 컬렉션 생성 및 삭제
- 데이터베이스 덤프 (ZIP) / 복원 (ZIP)
- Extended JSON 형식으로 내보내기 / 가져오기 (`$oid`, `$date` 등 보존)
- 인증 (사용자 이름, 비밀번호, 인증 DB 지정)
- TLS/SSL 연결 (CA 인증서, 클라이언트 인증서 지원, 자체 서명 인증서 허용)
- SSH 터널 연결 (키 인증 및 비밀번호 인증)
- **다국어 UI**: 日本語 / English / 中文（简体）/ 中文（繁體）/ 한국어

## 요구 환경

| 용도 | 패키지 |
|---|---|
| 빌드 | Rust 1.77+, Node.js 20+, Tauri CLI v2 |
| SSH 비밀번호 인증 | `sshpass` |
| Linux Wayland | `GDK_BACKEND=x11` (아래 참고) |

## 설치

```bash
# 1. 저장소 복제
git clone <repository-url>
cd okzmongo

# 2. 의존 패키지 설치
npm install

# 3. 빌드
./build.sh

# 4. ~/bin에 배치 및 데스크탑 파일 생성
./install.sh
```

설치 후 `okzmongo` 명령으로 실행할 수 있습니다.

## 개발

```bash
# 개발 서버 시작 (Tauri + Vite 동시 실행)
GDK_BACKEND=x11 cargo tauri dev

# 프론트엔드만 실행 (UI 확인용)
npm run dev

# 타입 검사
npx tsc --noEmit                                    # TypeScript
cargo check --manifest-path src-tauri/Cargo.toml   # Rust
```

> **Wayland 환경 주의**: WebKit2GTK가 Wayland에서 `Error 71 (EPROTO)` 오류를 일으키는 알려진 버그가 있습니다. `GDK_BACKEND=x11`을 설정해 주세요.

## 연결 설정

연결마다 아래 항목을 설정할 수 있습니다. 선택 항목은 비활성화 가능합니다.

| 항목 | 설명 |
|---|---|
| 호스트 / 포트 | MongoDB 서버 주소 |
| 인증 | 사용자 이름, 비밀번호, 인증 DB |
| TLS | CA 인증서, 클라이언트 인증서, 자체 서명 허용 |
| SSH 터널 | 호스트, 포트, 사용자 이름, 키 파일 또는 비밀번호 |

연결 설정은 `~/.local/share/info.okazoh.okzmongo/connections.json`에 저장됩니다.

## 언어 설정

오른쪽 상단의 드롭다운에서 UI 표시 언어를 변경할 수 있습니다. 선택한 언어는 브라우저의 로컬 스토리지에 저장됩니다. 처음 실행 시에는 시스템 언어 설정(`navigator.language`)이 자동으로 적용됩니다.

## 아키텍처

```
React UI
  └─ invoke("명령어", { ... })  ─→  Tauri IPC
       └─ src-tauri/src/commands/  ─→  MongoDB / SSH
```

| 레이어 | 기술 |
|---|---|
| 프론트엔드 | React 19, TypeScript, Vite 6, CSS Flexbox |
| 백엔드 | Rust, Tauri v2, mongodb crate v3, tokio |
| IPC | Tauri `invoke()` 전용 (HTTP/WebSocket 없음) |

## 라이선스

MIT License. 자세한 내용은 [LICENSE](LICENSE)를 참조하세요.
