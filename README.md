# OCS-CLI

**AI Agent 的网课自动化工具箱** — 开发中

让 AI Agent 能够操控浏览器，复用 ocsjs 的识别逻辑，完成课程学习任务。

```
AI Agent ←→ ocs-cli ←HTTP→ ocs-desktop ←Playwright→ Chrome + ocsjs
```

> 本项目正在积极开发中，部分功能尚未完成或未经充分测试。欢迎反馈问题。

## 当前状态

| 功能 | 状态 | 说明 |
|------|------|------|
| 浏览器控制 | ✅ 可用 | 导航、点击、填写、截图、DOM 快照 |
| iframe 操作 | ✅ 可用 | 递归搜索、题目提取、答案注入 |
| 学习通课程导航 | ✅ 已测试 | 课程列表、章节列表、进入学习页 |
| 学习通视频检测 | ✅ 已测试 | iframe 内视频元素检测 |
| 智慧树课程导航 | ⚠️ 基本可用 | 课程列表、章节获取，视频页面跳转待完善 |
| 智慧树视频控制 | ⚠️ 待调试 | 视频端点的 pageIndex 参数有兼容性问题 |
| 答题（选择/填空） | ⚠️ 待测试 | iframe 内答案注入和提交，未在真实答题场景验证 |
| 登录自动化 | ⚠️ 待测试 | 学习通/智慧树登录端点已写，未完整验证 |
| OCR 验证码 | ⚠️ 依赖外部 | 需要 ocs-desktop 的 ddddocr 模块 |
| 其他平台 | 🔲 待开发 | 智慧职教/职教云/MOOC/雨课堂 |
| MCP 服务器 | 🔲 待测试 | 基础框架已有，未验证 |

## 快速开始

### 前置条件

- Node.js >= 20
- [ocs-desktop](https://github.com/ocsjs/ocs-desktop) 已启动，浏览器已打开

### 安装

```bash
git clone https://github.com/DeliciousBuding/ocs-cli.git
cd ocs-cli
npm install
npm run build
npm link
```

### 使用

```bash
# 连接 ocs-desktop
ocs connect

# 检查环境
ocs doctor

# 学习通：查看课程 → 进入章节 → 检测任务
ocs course list --json
ocs course open <courseId> <clazzId> <chapterId>
ocs iframe list
ocs iframe questions 0 --json    # 提取题目
ocs video status                 # 检测视频
ocs video autoplay -r 2          # 2x 播放
```

## 命令速查

```
ocs doctor                              # 环境检查
ocs connect                             # 连接 ocs-desktop
ocs detect <url>                        # 检测课程平台

ocs page list / open / screenshot / snapshot / eval / content / url
ocs act click / fill / press / hover / wait
ocs iframe list / eval / media / questions / answer / submit / batch
ocs video status / play / pause / rate / autoplay
ocs course list / chapters / open / remaining
ocs zhs courses / video / login-status / login-phone / login-school
ocs config get / set / cache / clear-cache
ocs ocr <image>                         # 验证码识别
ocs request <method> <path>             # 原始 API 请求
```

所有命令支持 `--json` 输出。

## Agent 集成

### HTTP API

ocs-cli 通过 HTTP 与 ocs-desktop 的 Agent 服务通信（端口 17900，带认证令牌）。

### MCP（开发中）

```json
{
  "mcpServers": {
    "ocs": {
      "command": "node",
      "args": ["path/to/ocs-cli/dist/mcp/entry.js"]
    }
  }
}
```

### Skill

`skill/SKILL.md` 包含 Agent 使用手册，覆盖所有已实现命令。

## 架构

```
ocs-cli/
├── src/
│   ├── browser/controller.ts    # 浏览器控制器
│   ├── server/index.ts          # HTTP API 服务
│   ├── platform/                # 平台检测 + ocsjs 桥接
│   ├── cli/index.ts             # CLI 命令
│   └── mcp/                     # MCP 服务器（开发中）
├── skill/SKILL.md               # Agent 使用手册
└── reference/                   # ocsjs + ocs-desktop 源码参考
```

## 相关项目

- [ocsjs](https://github.com/ocsjs/ocsjs) — 网课自动化用户脚本
- [ocs-desktop](https://github.com/ocsjs/ocs-desktop) — 网课自动化桌面客户端

## 许可证

MIT
