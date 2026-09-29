# okzMongo

Tauri v2 + React 19 で作成した、軽量・高速な MongoDB GUI クライアント。
**「本番 DB を安全に触れる」ことと、「データを制限なく出し入れできる」こと**を軸に設計しています。

**他言語版 / Other languages:**
[English](README.en.md) | [中文（简体）](README.zh-CN.md) | [中文（繁體）](README.zh-TW.md) | [한국어](README.ko.md)

---

## okzMongo の特長

### 🛡 接続先ごとのきめ細かなパーミッション設定

各接続に **環境区分（本番 / 検証 / 開発）** を割り当て、**環境 × 操作** のポリシーマトリクスで、操作ごとに `許可` / `警告` / `禁止` を一括設定できます。

| 操作 | 本番（初期値） | 検証（初期値） | 開発（初期値） |
|---|---|---|---|
| ドキュメント追加 | 警告 | 許可 | 許可 |
| ドキュメント更新 | 警告 | 許可 | 許可 |
| ドキュメント削除 | 警告 | 警告 | 許可 |
| コレクション削除 | 警告 | 警告 | 許可 |
| インポート | **禁止** | 警告 | 許可 |
| DB リストア | **禁止** | 警告 | 許可 |
| クエリパッドでの書き込み（insert/update/delete） | 警告 | 許可 | 許可 |

- 「警告」は環境色付きの確認ダイアログ、「禁止」は実行不可のダイアログを表示
- GUI 操作だけでなくクエリパッドからの書き込みも同じポリシーで保護
- マトリクスはタイトルバーの ⚙ から自由に変更可能（すべてのセルを個別に設定）
- 本番接続の誤操作（うっかり drop / 全件 import 等）を、接続を切り替えるだけで自動的に防げる

### 📦 制限のないインポート／エクスポート

- **コレクション単位**：件数の上限なしで全件をエクスポート／インポート（Extended JSON。`$oid`・`$date` などの BSON 型を完全保持）
- **データベース単位**：全コレクションを 1 つの ZIP にダンプ、ZIP からリストア
- 表示ページネーション（50 件/ページ）とは無関係に、**全ドキュメントが対象**
- 別サーバー間のデータ移送・バックアップ・検証環境へのデータ複製がそのまま行える

### その他の主な機能

- **クエリパッド**：mongosh 風の JavaScript 式で実行。コンテンツアシスト（コレクション・メソッド・演算子・フィールド名の補完、`Ctrl+Space`）付き
- **クエリ履歴パネル**：MongoDB へ実際に送ったクエリ（mongosh 風表記＋Extended JSON・所要時間・成否）を時系列で確認
- **ドキュメントツリー**：Key / Value / Type 列表示、インライン編集、キー名変更（ダブルクリック／コンテキストメニュー）、BSON 型対応
- **JSON 入力を JavaScript 式で記述**：キーの引用符省略、`ObjectId()` 等が使用可能
- **接続失敗の原因診断**：SSH / TCP / MongoDB の各段階の進捗と失敗理由を表示
- **UI 多言語対応**：日本語 / English / 中文（简体・繁體）/ 한국어 / Русский / Қазақша / Español / Português / Français / Deutsch / Italiano / Nederlands / Svenska / Norsk / العربية / ไทย / Tiếng Việt（18 言語）

## 基本機能

- MongoDB への接続・切断（複数接続設定の管理・複製）
- データベース / コレクションのツリー表示、作成・削除
- ドキュメントの一覧表示・ページネーション（50件/ページ）・追加・編集・削除
- 認証（ユーザー名・パスワード・認証 DB 指定）
- TLS/SSL 接続（CA 証明書・クライアント証明書対応、自己署名証明書許可）
- SSH トンネル経由接続（鍵認証・パスワード認証）
- 接続パスワードは AES-256-GCM で暗号化して保存

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
| 環境区分 | 本番 / 検証 / 開発（操作ポリシーの適用単位） |

接続設定は `~/.local/share/info.okazoh.okzmongo/connections.json` に保存されます（パスワード類は暗号化）。

> **ポリシーについて**: 操作ポリシーは誤操作防止のための UI ガードレールであり、アプリ設定として `localStorage` に保存されます（セキュリティ境界ではありません）。DB 側の権限制御と併用してください。

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
