# okzMongo

基于 Tauri v2 + React 19 构建的轻量、快速的 MongoDB 图形界面客户端。
围绕两点设计：**安全地操作生产数据库**，以及**不受限制地导入导出数据**。

**其他语言：**
[日本語](README.md) | [English](README.en.md) | [中文（繁體）](README.zh-TW.md) | [한국어](README.ko.md)

---

## okzMongo 的特色

### 🛡 按连接目标进行精细的权限设置

为每个连接指定**环境类别（生产 / 预发布 / 开发）**，通过 **环境 × 操作** 的策略矩阵，为每种操作统一设置 `允许` / `警告` / `禁止`。

| 操作 | 生产（默认） | 预发布（默认） | 开发（默认） |
|---|---|---|---|
| 添加文档 | 警告 | 允许 | 允许 |
| 更新文档 | 警告 | 允许 | 允许 |
| 删除文档 | 警告 | 警告 | 允许 |
| 删除集合 | 警告 | 警告 | 允许 |
| 导入 | **禁止** | 警告 | 允许 |
| 还原数据库 | **禁止** | 警告 | 允许 |
| 查询面板中的写入（insert/update/delete） | 警告 | 允许 | 允许 |

- “警告”显示带环境颜色边框的确认对话框，“禁止”显示对话框并拒绝执行
- 不仅保护 GUI 操作，也保护从查询面板发起的写入
- 可通过标题栏的 ⚙ 自由修改整个矩阵（每个单元格可单独设置）
- 只需选对连接，即可自动防止在生产环境误执行 drop 或整库导入等操作

### 📦 不受限制的导入 / 导出

- **按集合**：不限文档数量，导出 / 导入全部文档（Extended JSON，完整保留 `$oid`、`$date` 等 BSON 类型）
- **按数据库**：将所有集合打包为一个 ZIP 导出，并可从 ZIP 还原
- 与每页 50 条的显示分页无关，**所有文档均在范围内**
- 可直接用于服务器间数据迁移、备份、向预发布环境复制数据

### 其他主要功能

- **查询面板**：以 mongosh 风格的 JavaScript 表达式执行，带内容辅助（集合、方法、运算符、字段名补全，`Ctrl+Space`）
- **查询历史面板**：按时间顺序查看实际发送到 MongoDB 的查询（mongosh 写法 + Extended JSON、耗时、成败）
- **文档树**：Key / Value / Type 列显示、行内编辑、键名重命名（双击 / 右键菜单）、支持 BSON 类型
- **以 JavaScript 表达式书写 JSON 输入**：可省略键的引号，可使用 `ObjectId()` 等
- **连接失败原因诊断**：显示 SSH / TCP / MongoDB 各阶段的进度与失败原因
- **多语言界面**：18 种语言（日语、英语、简体/繁体中文、韩语、俄语、哈萨克语、西班牙语、葡萄牙语、法语、德语、意大利语、荷兰语、瑞典语、挪威语、阿拉伯语、泰语、越南语）

## 基本功能

- 连接 / 断开 MongoDB（管理、复制多个连接配置）
- 数据库与集合的树形视图，创建与删除
- 文档列表与分页浏览（每页 50 条）、添加、编辑、删除
- 身份认证（用户名、密码、认证数据库）
- TLS/SSL 连接（支持 CA 证书、客户端证书及自签名证书）
- SSH 隧道连接（支持密钥认证和密码认证）
- 保存的密码使用 AES-256-GCM 加密

## 环境要求

| 用途 | 软件包 |
|---|---|
| 构建 | Rust 1.77+、Node.js 20+、Tauri CLI v2 |
| SSH 密码认证 | `sshpass` |
| Linux Wayland | `GDK_BACKEND=x11`（见下文） |

## 安装

```bash
# 1. 克隆仓库
git clone <repository-url>
cd okzmongo

# 2. 安装依赖
npm install

# 3. 构建
./build.sh

# 4. 安装到 ~/bin 并创建桌面快捷方式
./install.sh
```

安装完成后，执行 `okzmongo` 即可启动。

## 开发

```bash
# 启动开发服务器（Tauri + Vite 同时启动）
GDK_BACKEND=x11 cargo tauri dev

# 仅启动前端（用于 UI 调试）
npm run dev

# 类型检查
npx tsc --noEmit                                    # TypeScript
cargo check --manifest-path src-tauri/Cargo.toml   # Rust
```

> **Wayland 注意事项**：WebKit2GTK 在 Wayland 下存在已知 Bug，会报 `Error 71 (EPROTO)`，需设置 `GDK_BACKEND=x11` 规避。

## 连接配置

每个连接配置支持以下选项，可选项均可禁用。

| 字段 | 说明 |
|---|---|
| 主机 / 端口 | MongoDB 服务器地址 |
| 认证 | 用户名、密码、认证数据库 |
| TLS | CA 证书、客户端证书、允许自签名 |
| SSH 隧道 | 主机、端口、用户名、密钥文件或密码 |
| 环境类别 | 生产 / 预发布 / 开发（操作策略的适用单位） |

连接配置保存于 `~/.local/share/info.okazoh.okzmongo/connections.json`。

> **关于策略**：操作策略是防止误操作的 UI 护栏，作为应用设置保存在 `localStorage` 中（并非安全边界）。请与数据库端的权限控制配合使用。

## 语言设置

点击右上角的下拉框可切换界面语言。所选语言保存于浏览器的本地存储（LocalStorage）中。首次启动时，将自动根据系统语言设置（`navigator.language`）选择语言。

## 架构

```
React UI
  └─ invoke("命令名", { ... })  ─→  Tauri IPC
       └─ src-tauri/src/commands/  ─→  MongoDB / SSH
```

| 层 | 技术 |
|---|---|
| 前端 | React 19、TypeScript、Vite 6、CSS Flexbox |
| 后端 | Rust、Tauri v2、mongodb crate v3、tokio |
| IPC | 仅使用 Tauri `invoke()`（无 HTTP/WebSocket） |

## 许可证

MIT License。详见 [LICENSE](LICENSE)。
