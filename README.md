# okzMongo

Tauri v2 + React 19 で作成した MongoDB GUI クライアント。

**他言語版 / Other languages:**
[English](README.en.md) | [中文（简体）](README.zh-CN.md) | [中文（繁體）](README.zh-TW.md) | [한국어](README.ko.md)

---

## 機能

- MongoDB への接続・切断（複数接続設定の管理）
- データベース / コレクションのツリー表示
- ドキュメントの一覧表示・ページネーション（50件/ページ）
- ドキュメントの追加・編集・削除
- コレクションの作成・削除
- データベースのダンプ（ZIP）/ リストア（ZIP）
- Extended JSON 形式でのエクスポート / インポート（`$oid`・`$date` 保持）
- 認証（ユーザー名・パスワード・認証 DB 指定）
- TLS/SSL 接続（CA 証明書・クライアント証明書対応、自己署名証明書許可）
- SSH トンネル経由接続（鍵認証・パスワード認証）
- **UI 多言語対応**：日本語 / English / 中文（简体）/ 中文（繁體）/ 한국어

## 必要環境

| 用途 | パッケージ |
|---|---|
| ビルド | Rust 1.77+, Node.js 20+, Tauri CLI v2 |
| SSH パスワード認証 | `sshpass` |
| Linux Wayland | `GDK_BACKEND=x11`（後述） |

## インストール

```bash
# 1. リポジトリをクローン
git clone <repository-url>
cd okzmongo

# 2. 依存パッケージをインストール
npm install

# 3. ビルド
./build.sh

# 4. ~/bin へ配置・デスクトップファイル作成
./install.sh
```

その後 `okzmongo` で起動できます。

## 開発

```bash
# 開発サーバー起動（Tauri + Vite 同時起動）
GDK_BACKEND=x11 cargo tauri dev

# フロントエンドのみ（UI 確認用）
npm run dev

# 型チェック
npx tsc --noEmit                                    # TypeScript
cargo check --manifest-path src-tauri/Cargo.toml   # Rust
```

> **Wayland 環境の注意**: WebKit2GTK が Wayland で `Error 71 (EPROTO)` を出す既知バグがあるため、`GDK_BACKEND=x11` が必要です。

## 接続設定

接続ごとに以下を設定できます。オプション項目は無効化可能です。

| 項目 | 説明 |
|---|---|
| ホスト / ポート | MongoDB サーバーのアドレス |
| 認証 | ユーザー名・パスワード・認証 DB |
| TLS | CA 証明書・クライアント証明書・自己署名許可 |
| SSH トンネル | ホスト・ポート・ユーザー名・鍵ファイルまたはパスワード |

接続設定は `~/.local/share/info.okazoh.okzmongo/connections.json` に保存されます。

## 言語設定

右上のセレクタから UI の表示言語を切り替えられます。選択した言語はブラウザのローカルストレージに保存されます。初回起動時はシステムの言語設定（`navigator.language`）が自動的に使用されます。

## アーキテクチャ

```
React UI
  └─ invoke("コマンド名", { ... })  ─→  Tauri IPC
       └─ src-tauri/src/commands/      ─→  MongoDB / SSH
```

| レイヤー | 技術 |
|---|---|
| フロントエンド | React 19, TypeScript, Vite 6, CSS Flexbox |
| バックエンド | Rust, Tauri v2, mongodb crate v3, tokio |
| IPC | Tauri `invoke()` のみ（HTTP/WebSocket なし） |

## ライセンス

MIT License. 詳細は [LICENSE](LICENSE) を参照してください。
