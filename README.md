# OCS-CLI

**AI Agent 浏览器自动化工具** — 复用 ocsjs 的页面识别与操作逻辑，让 AI Agent 能够连接浏览器进行自动化操作。

OCS-CLI 为 AI Agent 提供标准化的浏览器操作接口，支持：

- 浏览器生命周期管理（启动、关闭、多实例）
- 页面感知（截图、DOM 快照、页面状态）
- 元素操作（点击、填写、选择、按键）
- **ocsjs 识别逻辑复用**（题目提取、媒体检测、答案匹配）
- 多课程平台支持（超星、智慧树、智慧职教、职教云、MOOC、雨课堂）
- HTTP API + MCP 协议双重接口

## 架构设计

```
┌─────────────────────────────────────────────┐
│                AI Agent                      │
│         (Claude / Codex / 自定义)             │
├──────────────┬──────────────────────────────┤
│   MCP 协议    │       HTTP REST API          │
│  (stdio)     │     http://127.0.0.1:17800   │
├──────────────┴──────────────────────────────┤
│              OCS-CLI 核心层                   │
│  ┌──────────┐ ┌──────────┐ ┌──────────────┐ │
│  │ 浏览器控制 │ │ 平台检测  │ │ ocsjs 识别桥 │ │
│  │Playwright │ │ Detector │ │  OCSBridge   │ │
│  └──────────┘ └──────────┘ └──────────────┘ │
├─────────────────────────────────────────────┤
│          Chrome / Edge 浏览器                │
│        (launchPersistentContext)             │
└─────────────────────────────────────────────┘
```

## 快速开始

### 安装

```bash
git clone https://github.com/yourname/ocs-cli.git
cd ocs-cli
npm install
npm run build
npm link  # 全局可用 ocs 命令
```

### 基本使用

```bash
# 检查环境
ocs doctor

# 检测课程平台
ocs detect "https://mooc1.chaoxing.com/mycourse"

# ── 模式一：独立模式 ──
# ocs-cli 自己启动浏览器 + API 服务
ocs serve --port 17800

# 启动浏览器并导航
ocs launch --url "https://mooc1.chaoxing.com"

# ── 模式二：连接 ocs-desktop ──
# 连接到 ocs-desktop 已管理的浏览器（需要 ocs-desktop 已启动）
ocs connect --cdp-port 9222 --serve --port 17800

# ── 通用操作 ──
# 截图
ocs screenshot -o page.png

# 分析页面（提取题目、媒体等）
ocs analyze
```

### 供 Agent 使用（HTTP API）

启动服务后，Agent 通过 HTTP 请求控制浏览器：

```bash
# 启动服务
ocs serve --port 17800

# 健康检查
curl http://127.0.0.1:17800/health

# 导航到页面
curl -X POST http://127.0.0.1:17800/page/navigate \
  -H "Content-Type: application/json" \
  -d '{"url": "https://mooc1.chaoxing.com/mycourse"}'

# 获取页面截图（base64）
curl http://127.0.0.1:17800/page/screenshot

# 获取 DOM 快照
curl http://127.0.0.1:17800/page/snapshot

# 点击元素
curl -X POST http://127.0.0.1:17800/action/click \
  -H "Content-Type: application/json" \
  -d '{"selector": "#loginBtn"}'

# 填写表单
curl -X POST http://127.0.0.1:17800/action/fill \
  -H "Content-Type: application/json" \
  -d '{"selector": "#username", "value": "student01"}'

# 分析页面（ocsjs 识别逻辑）
curl http://127.0.0.1:17800/ocs/analyze

# 提取题目
curl http://127.0.0.1:17800/ocs/questions

# 检测媒体
curl http://127.0.0.1:17800/ocs/media

# 控制媒体播放
curl -X POST http://127.0.0.1:17800/ocs/media/control \
  -H "Content-Type: application/json" \
  -d '{"action": "setRate", "value": 2}'

# 选择答案（相似度匹配）
curl -X POST http://127.0.0.1:17800/ocs/answer \
  -H "Content-Type: application/json" \
  -d '{"questionText": "中国的首都是", "answerText": "北京"}'
```

## API 端点一览

### 浏览器管理

| 方法 | 端点 | 说明 |
|------|------|------|
| POST | `/browser/launch` | 启动浏览器 |
| POST | `/browser/connect` | 通过 CDP 连接已有浏览器 |
| POST | `/browser/close` | 关闭浏览器 |
| GET  | `/browser/list` | 列出运行中的浏览器 |

### 页面操作

| 方法 | 端点 | 说明 |
|------|------|------|
| GET  | `/pages` | 列出所有页面 |
| POST | `/page/navigate` | 导航到 URL |
| POST | `/page/new` | 新建页面 |
| POST | `/page/close` | 关闭页面 |
| GET  | `/page/state` | 获取页面状态 |
| GET  | `/page/content` | 获取页面 HTML |

### 感知接口

| 方法 | 端点 | 说明 |
|------|------|------|
| GET  | `/page/screenshot` | 截图（返回 base64） |
| GET  | `/page/snapshot` | DOM 快照 |

### 操作接口

| 方法 | 端点 | 说明 |
|------|------|------|
| POST | `/action/click` | 点击元素 |
| POST | `/action/fill` | 填写输入框 |
| POST | `/action/select` | 选择下拉框 |
| POST | `/action/press` | 按键 |
| POST | `/action/type` | 逐字输入 |
| POST | `/action/hover` | 悬停 |
| POST | `/action/wait` | 等待元素出现 |
| POST | `/eval` | 执行 JavaScript |

### OCS 识别接口

| 方法 | 端点 | 说明 |
|------|------|------|
| GET  | `/ocs/analyze` | 分析页面（题目+媒体+平台） |
| GET  | `/ocs/questions` | 提取所有题目 |
| GET  | `/ocs/media` | 检测媒体元素 |
| POST | `/ocs/media/control` | 控制播放 |
| POST | `/ocs/answer` | 选择答案 |

### 平台接口

| 方法 | 端点 | 说明 |
|------|------|------|
| GET  | `/platform/detect?url=` | 检测平台 |
| GET  | `/platform/list` | 列出所有平台 |

## MCP 集成

OCS-CLI 支持 MCP (Model Context Protocol)，可直接被 Claude Code 等 Agent 调用。

在 Agent 的 MCP 配置中添加：

```json
{
  "mcpServers": {
    "ocs": {
      "command": "node",
      "args": ["D:/Code/Projects/ocs-cli/dist/mcp/entry.js"],
      "transportType": "stdio"
    }
  }
}
```

### MCP 工具列表

| 工具名 | 说明 |
|--------|------|
| `browser_launch` | 启动浏览器 |
| `browser_close` | 关闭浏览器 |
| `browser_list` | 列出浏览器 |
| `page_navigate` | 导航 |
| `page_screenshot` | 截图 |
| `page_snapshot` | DOM 快照 |
| `page_content` | 获取 HTML |
| `action_click` | 点击 |
| `action_fill` | 填写 |
| `action_select` | 选择 |
| `action_press` | 按键 |
| `action_wait` | 等待元素 |
| `evaluate` | 执行 JS |
| `ocs_analyze` | 分析页面 |
| `ocs_questions` | 提取题目 |
| `ocs_media` | 检测媒体 |
| `ocs_media_control` | 控制播放 |
| `ocs_select_answer` | 选择答案 |
| `platform_detect` | 检测平台 |

## Agent 工作流示例

### 典型的 Agent 操作流程

```
1. browser_launch → 启动浏览器
2. page_navigate  → 导航到课程页面
3. ocs_analyze    → 分析页面，获取题目和媒体信息
4. page_screenshot → 截图让 Agent "看到" 页面
5. Agent 根据题目信息决定答案
6. ocs_select_answer → 选择答案
7. ocs_media_control → 控制视频播放
8. page_navigate  → 进入下一章节
```

### 与 Claude Code 集成

```bash
# Claude Code 可以通过 MCP 工具直接调用：
# 1. 启动浏览器 → browser_launch
# 2. 导航 → page_navigate("https://mooc1.chaoxing.com/mycourse")
# 3. 分析 → ocs_analyze()
# 4. 截图 → page_screenshot() → Agent 识别页面内容
# 5. 操作 → action_click / action_fill / ocs_select_answer
# 6. 控制 → ocs_media_control("setRate", 2)
```

## 支持的平台

| 平台 | ID | 域名 |
|------|----|------|
| 超星学习通 | `cx` | chaoxing.com, edu.cn, org.cn, xueyinonline.com |
| 智慧树 | `zhs` | zhihuishu.com, studywisdom.com |
| 智慧职教 | `icve` | icve.com.cn, courshare.cn, webtrn.cn |
| 职教云 | `zjy` | zjy2.icve.com.cn, zyk.icve.com.cn |
| 中国大学MOOC | `icourse` | icourse163.org |
| 雨课堂 | `yuketang` | yuketang.cn |

## 配置

### 认证

API 服务支持 Bearer Token 认证：

```bash
ocs serve --auth-token "your-secret-token"

# 请求时带上 Token
curl -H "Authorization: Bearer your-secret-token" http://127.0.0.1:17800/health
```

### 浏览器路径

如果自动检测不到 Chrome/Edge，手动指定：

```bash
ocs launch --executable-path "C:\Program Files\Google\Chrome\Application\chrome.exe"
ocs serve --executable-path "/usr/bin/google-chrome"
```

### 代理

```bash
ocs launch --proxy "http://127.0.0.1:7890"
```

## 开发

```bash
# 安装依赖
npm install

# 开发模式运行
npm run dev -- doctor

# 构建
npm run build

# 类型检查
npm run typecheck

# 测试
npm test
```

## 项目结构

```
ocs-cli/
├── src/
│   ├── browser/
│   │   └── controller.ts    # 浏览器控制器（Playwright-core）
│   ├── server/
│   │   └── index.ts         # HTTP API 服务（Express）
│   ├── platform/
│   │   ├── detector.ts      # 平台检测器
│   │   └── ocs-bridge.ts    # ocsjs 识别逻辑桥接
│   ├── cli/
│   │   └── index.ts         # CLI 命令（Commander）
│   ├── mcp/
│   │   ├── tools.ts         # MCP 工具定义
│   │   ├── server.ts        # MCP 服务器
│   │   └── entry.ts         # MCP 入口文件
│   ├── types.ts             # 类型定义
│   └── index.ts             # 库导出
├── reference/               # 参考仓库（ocsjs, ocs-desktop）
├── package.json
├── tsconfig.json
└── tsup.config.ts
```

## 技术栈

- **TypeScript** — 类型安全
- **Playwright-core** — 浏览器控制（不捆绑浏览器，使用系统 Chrome/Edge）
- **Express** — HTTP API 服务
- **Commander** — CLI 框架
- **chalk** — 终端着色

## 许可证

MIT
