# okzMongo

A MongoDB GUI client built with Tauri v2 + React 19.

**Other languages:**
[日本語](README.md) | [中文（简体）](README.zh-CN.md) | [中文（繁體）](README.zh-TW.md) | [한국어](README.ko.md)

---

## Features

- Connect / disconnect to MongoDB (manage multiple connection profiles)
- Tree view of databases and collections
- Document list with pagination (50 docs per page)
- Add, edit, and delete documents
- Create and drop collections
- Database dump (ZIP) / restore (ZIP)
- Export / import in Extended JSON format (preserves `$oid`, `$date`, etc.)
- Authentication (username, password, auth DB)
- TLS/SSL connections (CA cert, client cert, allow self-signed)
- SSH tunnel connections (key-based or password authentication)
- **Multilingual UI**: Japanese / English / 中文（简体）/ 中文（繁體）/ 한국어

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

Connection profiles are stored at `~/.local/share/info.okazoh.okzmongo/connections.json`.

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
