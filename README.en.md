# okzMongo

A lightweight, fast MongoDB GUI client built with Tauri v2 + React 19.
Designed around two ideas: **touching production databases safely** and **moving data in and out without limits**.

**Other languages:**
[日本語](README.md) | [中文（简体）](README.zh-CN.md) | [中文（繁體）](README.zh-TW.md) | [한국어](README.ko.md)

---

## Why okzMongo

### 🛡 Fine-grained permissions per connection target

Assign each connection an **environment tier (Production / Staging / Development)**, then set `Allow` / `Warn` / `Block` for every operation in an **environment × operation** policy matrix.

| Operation | Production (default) | Staging (default) | Development (default) |
|---|---|---|---|
| Insert document | Warn | Allow | Allow |
| Update document | Warn | Allow | Allow |
| Delete document | Warn | Warn | Allow |
| Drop collection | Warn | Warn | Allow |
| Import | **Block** | Warn | Allow |
| Restore database | **Block** | Warn | Allow |
| Writes from the query pad (insert/update/delete) | Warn | Allow | Allow |

- "Warn" shows a confirmation dialog framed in the environment colour; "Block" shows a dialog and refuses to run
- Protects not only GUI actions but also writes issued from the query pad
- Edit the whole matrix from the ⚙ button in the title bar (every cell is individually configurable)
- Just picking the right connection prevents accidents such as an unintended drop or full-collection import on production

### 📦 Import / export without limits

- **Per collection**: export / import every document with no document-count cap (Extended JSON, fully preserving BSON types such as `$oid` and `$date`)
- **Per database**: dump all collections into a single ZIP and restore from a ZIP
- Independent of the 50-docs-per-page display pagination — **all documents are included**
- Ready for server-to-server migration, backups, and copying data into staging

### Other highlights

- **Query pad**: run mongosh-style JavaScript expressions, with content assist (collections, methods, operators, field names; `Ctrl+Space`)
- **Query log panel**: see the queries actually sent to MongoDB (mongosh notation + Extended JSON, duration, success/failure) in chronological order
- **Document tree**: Key / Value / Type columns, inline editing, key renaming (double-click / context menu), BSON type support
- **JSON inputs as JavaScript expressions**: unquoted keys, `ObjectId()`, etc.
- **Connection failure diagnostics**: per-stage (SSH / TCP / MongoDB) progress and failure reasons
- **Multilingual UI**: 18 languages (Japanese, English, Chinese Simplified/Traditional, Korean, Russian, Kazakh, Spanish, Portuguese, French, German, Italian, Dutch, Swedish, Norwegian, Arabic, Thai, Vietnamese)

## Core features

- Connect / disconnect (manage and duplicate multiple connection profiles)
- Tree view of databases and collections; create and drop
- Document list with pagination (50 docs per page); add, edit, delete
- Authentication (username, password, auth DB)
- TLS/SSL connections (CA cert, client cert, allow self-signed)
- SSH tunnel connections (key-based or password authentication)
- Saved passwords are encrypted with AES-256-GCM

## Requirements

| Purpose | Package |
|---|---|
| Build | Rust 1.77+, Node.js 20+, Tauri CLI v2 |
| SSH password auth | `sshpass` |
| Linux Wayland | `GDK_BACKEND=x11` (see below) |

## Installation

```bash
# 1. Clone the repository
git clone <repository-url>
cd okzmongo

# 2. Install dependencies
npm install

# 3. Build
./build.sh

# 4. Install to ~/bin and create a desktop entry
./install.sh
```

After installation, launch with `okzmongo`.

## Development

```bash
# Start the dev server (Tauri + Vite simultaneously)
GDK_BACKEND=x11 cargo tauri dev

# Frontend only (for UI iteration)
npm run dev

# Type checking
npx tsc --noEmit                                    # TypeScript
cargo check --manifest-path src-tauri/Cargo.toml   # Rust
```

> **Wayland note**: WebKit2GTK has a known bug that causes `Error 71 (EPROTO)` under Wayland. Set `GDK_BACKEND=x11` to work around it.

## Connection Settings

Each connection profile supports the following options. All optional fields can be disabled.

| Field | Description |
|---|---|
| Host / Port | Address of the MongoDB server |
| Auth | Username, password, and auth DB |
| TLS | CA certificate, client certificate, allow self-signed |
| SSH Tunnel | Host, port, username, key file or password |
| Environment tier | Production / Staging / Development (unit to which operation policies apply) |

Connection profiles are stored at `~/.local/share/info.okazoh.okzmongo/connections.json` (passwords are encrypted).

> **About policies**: operation policies are a UI guardrail against mistakes, stored in `localStorage` as app settings (not a security boundary). Use them together with database-side access control.

## Language Settings

Use the selector in the top-right corner to switch the UI language. The selected language is saved in the browser's local storage. On first launch, the language is automatically detected from the system setting (`navigator.language`).

## Architecture

```
React UI
  └─ invoke("command", { ... })  ─→  Tauri IPC
       └─ src-tauri/src/commands/  ─→  MongoDB / SSH
```

| Layer | Technology |
|---|---|
| Frontend | React 19, TypeScript, Vite 6, CSS Flexbox |
| Backend | Rust, Tauri v2, mongodb crate v3, tokio |
| IPC | Tauri `invoke()` only (no HTTP/WebSocket) |

## License

MIT License. See [LICENSE](LICENSE) for details.
