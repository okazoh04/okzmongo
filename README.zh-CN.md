# OkzMongo

基于 Tauri v2 + React 19 构建的 MongoDB 图形界面客户端。

**其他语言：**
[日本語](README.md) | [English](README.en.md) | [中文（繁體）](README.zh-TW.md) | [한국어](README.ko.md)

---

## 功能

- 连接 / 断开 MongoDB（管理多个连接配置）
- 数据库与集合的树形视图
- 文档列表与分页浏览（每页 50 条）
- 添加、编辑、删除文档
- 创建、删除集合
- 数据库导出（ZIP）/ 还原（ZIP）
- 以 Extended JSON 格式导出 / 导入（保留 `$oid`、`$date` 等类型）
- 身份认证（用户名、密码、认证数据库）
- TLS/SSL 连接（支持 CA 证书、客户端证书及自签名证书）
- SSH 隧道连接（支持密钥认证和密码认证）
- **多语言界面**：日本語 / English / 中文（简体）/ 中文（繁體）/ 한국어

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

连接配置保存于 `~/.local/share/info.okazoh.okzmongo/connections.json`。

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
