# okzMongo

基於 Tauri v2 + React 19 建構的輕量、快速的 MongoDB 圖形介面客戶端。
圍繞兩點設計：**安全地操作正式環境資料庫**，以及**不受限制地匯入匯出資料**。

**其他語言：**
[日本語](README.md) | [English](README.en.md) | [中文（简体）](README.zh-CN.md) | [한국어](README.ko.md)

---

## okzMongo 的特色

### 🛡 依連線目標進行細緻的權限設定

為每個連線指定**環境類別（正式 / 測試 / 開發）**，透過 **環境 × 操作** 的原則矩陣，為每種操作統一設定 `允許` / `警告` / `禁止`。

| 操作 | 正式（預設） | 測試（預設） | 開發（預設） |
|---|---|---|---|
| 新增文件 | 警告 | 允許 | 允許 |
| 更新文件 | 警告 | 允許 | 允許 |
| 刪除文件 | 警告 | 警告 | 允許 |
| 刪除集合 | 警告 | 警告 | 允許 |
| 匯入 | **禁止** | 警告 | 允許 |
| 還原資料庫 | **禁止** | 警告 | 允許 |
| 查詢面板中的寫入（insert/update/delete） | 警告 | 允許 | 允許 |

- 「警告」顯示帶環境顏色邊框的確認對話框，「禁止」顯示對話框並拒絕執行
- 不僅保護 GUI 操作，也保護從查詢面板發起的寫入
- 可透過標題列的 ⚙ 自由修改整個矩陣（每個儲存格可個別設定）
- 只需選對連線，即可自動防止在正式環境誤執行 drop 或整批匯入等操作

### 📦 不受限制的匯入 / 匯出

- **以集合為單位**：不限文件數量，匯出 / 匯入全部文件（Extended JSON，完整保留 `$oid`、`$date` 等 BSON 型別）
- **以資料庫為單位**：將所有集合打包為一個 ZIP 匯出，並可從 ZIP 還原
- 與每頁 50 筆的顯示分頁無關，**所有文件皆在範圍內**
- 可直接用於伺服器間資料遷移、備份、將資料複製到測試環境

### 其他主要功能

- **查詢面板**：以 mongosh 風格的 JavaScript 運算式執行，具備內容輔助（集合、方法、運算子、欄位名稱補全，`Ctrl+Space`）
- **查詢歷程面板**：依時間順序檢視實際送至 MongoDB 的查詢（mongosh 寫法 + Extended JSON、耗時、成敗）
- **文件樹**：Key / Value / Type 欄位顯示、行內編輯、鍵名重新命名（雙擊 / 右鍵選單）、支援 BSON 型別
- **以 JavaScript 運算式撰寫 JSON 輸入**：可省略鍵的引號，可使用 `ObjectId()` 等
- **連線失敗原因診斷**：顯示 SSH / TCP / MongoDB 各階段的進度與失敗原因
- **多語言介面**：18 種語言（日語、英語、簡體/繁體中文、韓語、俄語、哈薩克語、西班牙語、葡萄牙語、法語、德語、義大利語、荷蘭語、瑞典語、挪威語、阿拉伯語、泰語、越南語）

## 基本功能

- 連線 / 中斷 MongoDB（管理、複製多個連線設定）
- 資料庫與集合的樹狀檢視，建立與刪除
- 文件列表與分頁瀏覽（每頁 50 筆）、新增、編輯、刪除
- 身份驗證（使用者名稱、密碼、驗證資料庫）
- TLS/SSL 連線（支援 CA 憑證、用戶端憑證及自簽憑證）
- SSH 通道連線（支援金鑰驗證與密碼驗證）
- 儲存的密碼以 AES-256-GCM 加密

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
| 環境類別 | 正式 / 測試 / 開發（操作原則的套用單位） |

連線設定儲存於 `~/.local/share/info.okazoh.okzmongo/connections.json`。

> **關於原則**：操作原則是防止誤操作的 UI 護欄，作為應用程式設定儲存在 `localStorage` 中（並非安全邊界）。請與資料庫端的權限控制搭配使用。

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
