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
| `state.rs` | `AppState`（接続設定・アクティブクライアント・SSH PID を `Mutex` で保持、暗号化鍵を `OnceLock` で保持） |
| `crypto.rs` | AES-256-GCM によるパスワード暗号化/復号（`enc:` プレフィックスで暗号化済みを識別） |
| `commands/connection.rs` | 接続管理：SSH トンネル起動・TLS オプション構築・MongoDB ping 確認、接続設定の保存/読み込み |
| `commands/database.rs` | DB/コレクション操作：find・count・insert・update・delete・drop・create |
| `commands/export.rs` | コレクション単位のインポート/エクスポート（NDJSON）+ DB 単位のダンプ/リストア（ZIP） |
| `lib.rs` | `tauri::generate_handler![]` でコマンド登録、起動時に暗号化鍵ロードと接続設定の復元 |

**接続確立の流れ（`connect` コマンド）:**
1. SSH 有効なら `ssh -N -L <local>:<mongo_host>:<mongo_port>` を spawn し、`std::mem::forget` でプロセスを保持（PID を `ssh_pids` に記録）
2. ポートが開くまで 200ms ポーリング（最大 5 秒）
3. `ClientOptions::parse` → 認証 (`Credential`) / TLS (`TlsOptions`) を設定
4. `admin.ping` で疎通確認

**TLS の注意**: `TlsOptions` は `#[non_exhaustive]` なので struct literal 不可。`TlsOptions::default()` 後にフィールドを直接設定すること。

**SSH パスワード認証**: `sshpass` コマンドが必要。鍵認証または SSH エージェントなら不要。

**パスワード暗号化**: `crypto.rs` の `encrypt_opt`/`decrypt_opt` を使用。保存時は `enc:` プレフィックス付き Base64 文字列で保存。旧来の平文は `decrypt_opt` がフォールバックで素通しする。暗号化鍵は `~/.local/share/info.okazoh.okzmongo/key.bin` に格納。

### React フロントエンド (`src/`)

| ファイル | 役割 |
|---|---|
| `types.ts` | `ConnectionConfig`・`AuthConfig`・`TlsConfig`・`SshConfig`・`SelectedItem` の型定義（Rust の `state.rs` と対応） |
| `i18n.ts` | ロケール型・メッセージ辞書・`useI18n()` フック・`tpl()` テンプレート関数 |
| `I18nProvider.tsx` | ロケール状態管理、`localStorage` の `okzmongo-locale` キーで永続化、`navigator.language` で自動検出 |
| `App.tsx` | レイアウト（タイトルバー・サイドバー・メインエリア・ステータスバー）・フィルタ状態管理・言語切替ピッカー |
| `components/Sidebar.tsx` | 接続ツリー（接続 → DB → コレクション）・接続フォームのインライン展開・DB ダンプ/リストア |
| `components/ConnectionForm.tsx` | 接続設定フォーム（基本・認証・TLS・SSH の4セクション） |
| `components/DocumentList.tsx` | ドキュメント一覧・ページネーション（50件）・エクスポート/インポートボタン統合 |
| `components/DocumentEditor.tsx` | ドキュメント追加・編集モーダル（JSON テキストエリア） |
| `components/ExportImport.tsx` | コレクション単位のエクスポート/インポートUI |
| `components/About.tsx` | Aboutダイアログ |

**レイアウト**: CSS Flexbox のみ（外部UIライブラリなし）。CSS 変数でテーマ管理（`src/index.css` の `:root`）。

**i18n**: `src/locales/` 配下に `ja.ts`・`en.ts`・`zh-CN.ts`・`zh-TW.ts`・`ko.ts`。`ja.ts` が型の基準（`Messages = typeof ja`）。文字列テンプレートは `tpl(t.someKey, { varName: value })` で `{varName}` を置換。

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

接続設定は `~/.local/share/info.okazoh.okzmongo/connections.json` に JSON で永続化。パスワード類は AES-256-GCM 暗号化（`enc:` プレフィックス）して保存。起動時に `setup` フックで読み込み、add/update/remove のたびに書き込む。

## i18n の拡張方法

新しい文字列を追加するときは、まず `src/locales/ja.ts` にキーを追加し、他の4言語ファイルにも同一キーを追加する。`Messages = typeof ja` により TypeScript がキーの欠落を検出する。
