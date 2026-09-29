# okzMongo

Tauri v2 + React 19로 만든 가볍고 빠른 MongoDB GUI 클라이언트.
**운영 DB를 안전하게 다루는 것**과 **데이터를 제한 없이 주고받는 것**을 축으로 설계했습니다.

**다른 언어:**
[日本語](README.md) | [English](README.en.md) | [中文（简体）](README.zh-CN.md) | [中文（繁體）](README.zh-TW.md)

---

## okzMongo의 특징

### 🛡 연결 대상별 세밀한 권한 설정

각 연결에 **환경 구분(운영 / 검증 / 개발)** 을 지정하고, **환경 × 작업** 정책 매트릭스로 작업별 `허용` / `경고` / `금지`를 일괄 설정할 수 있습니다.

| 작업 | 운영(기본값) | 검증(기본값) | 개발(기본값) |
|---|---|---|---|
| 문서 추가 | 경고 | 허용 | 허용 |
| 문서 수정 | 경고 | 허용 | 허용 |
| 문서 삭제 | 경고 | 경고 | 허용 |
| 컬렉션 삭제 | 경고 | 경고 | 허용 |
| 가져오기 | **금지** | 경고 | 허용 |
| DB 복원 | **금지** | 경고 | 허용 |
| 쿼리 패드에서의 쓰기(insert/update/delete) | 경고 | 허용 | 허용 |

- "경고"는 환경 색상 테두리의 확인 대화상자, "금지"는 실행 불가 대화상자를 표시
- GUI 조작뿐 아니라 쿼리 패드의 쓰기도 동일한 정책으로 보호
- 타이틀바의 ⚙에서 매트릭스 전체를 자유롭게 변경 가능(모든 셀을 개별 설정)
- 올바른 연결을 선택하는 것만으로 운영 환경에서의 실수(drop, 전체 가져오기 등)를 자동으로 방지

### 📦 제한 없는 가져오기 / 내보내기

- **컬렉션 단위**: 문서 수 제한 없이 전체 내보내기 / 가져오기(Extended JSON, `$oid`·`$date` 등 BSON 타입 완전 보존)
- **데이터베이스 단위**: 모든 컬렉션을 하나의 ZIP으로 덤프하고 ZIP에서 복원
- 페이지당 50건의 표시 페이지네이션과 무관하게 **모든 문서가 대상**
- 서버 간 데이터 이전·백업·검증 환경으로의 데이터 복제에 그대로 사용 가능

### 기타 주요 기능

- **쿼리 패드**: mongosh 스타일 JavaScript 식으로 실행, 콘텐츠 어시스트(컬렉션·메서드·연산자·필드명 자동완성, `Ctrl+Space`) 지원
- **쿼리 기록 패널**: MongoDB로 실제 전송한 쿼리(mongosh 표기 + Extended JSON, 소요 시간, 성공 여부)를 시간순으로 확인
- **문서 트리**: Key / Value / Type 열 표시, 인라인 편집, 키 이름 변경(더블 클릭 / 컨텍스트 메뉴), BSON 타입 지원
- **JSON 입력을 JavaScript 식으로 작성**: 키 따옴표 생략, `ObjectId()` 등 사용 가능
- **연결 실패 원인 진단**: SSH / TCP / MongoDB 단계별 진행 상황과 실패 원인 표시
- **다국어 UI**: 18개 언어(일본어, 영어, 중국어 간체/번체, 한국어, 러시아어, 카자흐어, 스페인어, 포르투갈어, 프랑스어, 독일어, 이탈리아어, 네덜란드어, 스웨덴어, 노르웨이어, 아랍어, 태국어, 베트남어)

## 기본 기능

- MongoDB 연결 / 해제(여러 연결 설정 관리·복제)
- 데이터베이스 / 컬렉션 트리 뷰, 생성 및 삭제
- 문서 목록 및 페이지 탐색(페이지당 50건), 추가·편집·삭제
- 인증(사용자 이름, 비밀번호, 인증 DB 지정)
- TLS/SSL 연결(CA 인증서, 클라이언트 인증서 지원, 자체 서명 인증서 허용)
- SSH 터널 연결(키 인증 및 비밀번호 인증)
- 저장되는 비밀번호는 AES-256-GCM으로 암호화

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
| 환경 구분 | 운영 / 검증 / 개발(작업 정책의 적용 단위) |

연결 설정은 `~/.local/share/info.okazoh.okzmongo/connections.json`에 저장됩니다.

> **정책에 대하여**: 작업 정책은 실수를 막기 위한 UI 가드레일이며 앱 설정으로 `localStorage`에 저장됩니다(보안 경계가 아님). DB 측 권한 제어와 함께 사용하세요.

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
