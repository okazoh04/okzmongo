# CLAUDE.md

This file provides guidance to Claude Code (claude.ai/code) when working with code in this repository.

## プロジェクト概要

**OkzMongo** — Tauri v2 + React 19 + MongoDB v3 で作成した MongoDB GUI クライアント。

## コマンド

```bash
# 開発サーバー起動（Tauri + Vite 同時起動）
GDK_BACKEND=x11 cargo tauri dev   # Linux Wayland 環境では必須

# フロントエンドのみ起動（UI確認用）
npm run dev

# 型チェック
npx tsc --noEmit              # TypeScript
cargo check --manifest-path src-tauri/Cargo.toml  # Rust

# リリースビルド
cargo tauri build
```

> **Wayland 環境の注意**: WebKit2GTK が Wayland で `Error 71 (EPROTO)` を出す既知バグがあるため、`GDK_BACKEND=x11` が必要。

## アーキテクチャ

### データフロー

```
React UI
  └─ invoke("コマンド名", { ... })  ─→  Tauri IPC
       └─ src-tauri/src/commands/      ─→  MongoDB / SSH
```

フロントエンドからは `@tauri-apps/api/core` の `invoke()` のみで Rust バックエンドと通信する。HTTP/WebSocket は使用しない。

### Rust バックエンド (`src-tauri/src/`)

| ファイル | 役割 |
|---|---|
| `state.rs` | `AppState`（接続設定・アクティブクライアント・SSH PID を `Mutex` で保持） |
| `commands/connection.rs` | 接続管理：SSH トンネル起動・TLS オプション構築・MongoDB ping 確認 |
| `commands/database.rs` | DB/コレクション操作：find・count・insert・update・delete・drop・create |
| `commands/export.rs` | インポート/エクスポート：Extended JSON 形式（`$oid`・`$date` を保持） |
| `lib.rs` | `tauri::generate_handler![]` でコマンド登録 |

**接続確立の流れ（`connect` コマンド）:**
1. SSH 有効なら `ssh -N -L <local>:<mongo_host>:<mongo_port>` を spawn し、`std::mem::forget` でプロセスを保持（PID を `ssh_pids` に記録）
2. ポートが開くまで 200ms ポーリング（最大 5 秒）
3. `ClientOptions::parse` → 認証 (`Credential`) / TLS (`TlsOptions`) を設定
4. `admin.ping` で疎通確認

**TLS の注意**: `TlsOptions` は `#[non_exhaustive]` なので struct literal 不可。`TlsOptions::default()` 後にフィールドを直接設定すること。

**SSH パスワード認証**: `sshpass` コマンドが必要。鍵認証または SSH エージェントなら不要。

### React フロントエンド (`src/`)

| ファイル | 役割 |
|---|---|
| `types.ts` | `ConnectionConfig`・`AuthConfig`・`TlsConfig`・`SshConfig` の型定義（Rust の `state.rs` と対応） |
| `App.tsx` | タブ管理（接続 / ブラウズ）・グローバル状態保持・フィルタ状態管理 |
| `components/ConnectionManager.tsx` | 接続設定フォーム（基本・認証・TLS・SSH の4セクション）・接続一覧 |
| `components/Sidebar.tsx` | DB/コレクションのツリー表示（遅延ロード）・コレクション作成/削除 |
| `components/DocumentList.tsx` | ドキュメント一覧・ページネーション（50件）・エクスポート/インポートボタン統合 |
| `components/DocumentEditor.tsx` | ドキュメント追加・編集モーダル（JSON テキストエリア） |

**レイアウト**: CSS Flexbox のみ（外部UIライブラリなし）。CSS 変数でテーマ管理（`src/index.css` の `:root`）。

### Tauri 権限

`src-tauri/capabilities/default.json` で `dialog`・`fs` プラグインの権限を付与。`tauri.conf.json` の `plugins` セクションには記載しない（`dialog` は unit 型で空オブジェクトを受け付けないため）。

## 接続設定の構造

`ConnectionConfig` は接続ごとに以下を持つ。各オプション項目は `null` で無効：

```typescript
{
  id: string;       // UUID（バックエンドで採番）
  name: string;
  host: string;     // MongoDB ホスト名（SSHトンネル時はトンネル先ホスト）
  port: number;
  auth: { username, password, auth_db } | null;
  tls:  { enabled, ca_file, cert_key_file, allow_invalid_certs } | null;
  ssh:  { enabled, host, port, username, password, key_file } | null;
}
```

接続設定は `~/.local/share/info.okazoh.okzmongo/connections.json` に JSON で永続化される。パスワードは平文保存。起動時に `setup` フックで読み込み、add/update/remove のたびに書き込む。
