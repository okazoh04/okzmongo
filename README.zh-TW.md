# OkzMongo

基於 Tauri v2 + React 19 建構的 MongoDB 圖形介面客戶端。

**其他語言：**
[日本語](README.md) | [English](README.en.md) | [中文（简体）](README.zh-CN.md) | [한국어](README.ko.md)

---

## 功能

- 連線 / 中斷 MongoDB（管理多個連線設定）
- 資料庫與集合的樹狀檢視
- 文件列表與分頁瀏覽（每頁 50 筆）
- 新增、編輯、刪除文件
- 建立、刪除集合
- 資料庫匯出（ZIP）/ 還原（ZIP）
- 以 Extended JSON 格式匯出 / 匯入（保留 `$oid`、`$date` 等型別）
- 身份驗證（使用者名稱、密碼、驗證資料庫）
- TLS/SSL 連線（支援 CA 憑證、用戶端憑證及自簽憑證）
- SSH 通道連線（支援金鑰驗證與密碼驗證）
- **多語言介面**：日本語 / English / 中文（简体）/ 中文（繁體）/ 한국어

## 環境需求

| 用途 | 套件 |
|---|---|
| 建置 | Rust 1.77+、Node.js 20+、Tauri CLI v2 |
| SSH 密碼驗證 | `sshpass` |
| Linux Wayland | `GDK_BACKEND=x11`（見下方說明） |

## 安裝

```bash
# 1. 複製儲存庫
git clone <repository-url>
cd okzmongo

# 2. 安裝相依套件
npm install

# 3. 建置
./build.sh

# 4. 安裝至 ~/bin 並建立桌面捷徑
./install.sh
```

安裝完成後，執行 `okzmongo` 即可啟動。

## 開發

```bash
# 啟動開發伺服器（Tauri + Vite 同時啟動）
GDK_BACKEND=x11 cargo tauri dev

# 僅啟動前端（用於 UI 除錯）
npm run dev

# 型別檢查
npx tsc --noEmit                                    # TypeScript
cargo check --manifest-path src-tauri/Cargo.toml   # Rust
```

> **Wayland 注意事項**：WebKit2GTK 在 Wayland 下有已知 Bug，會出現 `Error 71 (EPROTO)`，需設定 `GDK_BACKEND=x11` 來迴避。

## 連線設定

每個連線設定支援以下選項，可選項目均可停用。

| 欄位 | 說明 |
|---|---|
| 主機 / 連接埠 | MongoDB 伺服器位址 |
| 驗證 | 使用者名稱、密碼、驗證資料庫 |
| TLS | CA 憑證、用戶端憑證、允許自簽憑證 |
| SSH 通道 | 主機、連接埠、使用者名稱、金鑰檔案或密碼 |

連線設定儲存於 `~/.local/share/info.okazoh.okzmongo/connections.json`。

## 語言設定

點擊右上角的下拉選單可切換介面語言。所選語言儲存於瀏覽器的本機儲存空間（LocalStorage）。首次啟動時，將自動依系統語言設定（`navigator.language`）選擇語言。

## 架構

```
React UI
  └─ invoke("指令名稱", { ... })  ─→  Tauri IPC
       └─ src-tauri/src/commands/   ─→  MongoDB / SSH
```

| 層 | 技術 |
|---|---|
| 前端 | React 19、TypeScript、Vite 6、CSS Flexbox |
| 後端 | Rust、Tauri v2、mongodb crate v3、tokio |
| IPC | 僅使用 Tauri `invoke()`（無 HTTP/WebSocket） |

## 授權條款

MIT License。詳見 [LICENSE](LICENSE)。
