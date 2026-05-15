# OCS-CLI

**AI Agent 的网课自动化工具箱**

让 AI Agent 能够操控浏览器，自动完成超星学习通、智慧树等平台的课程学习任务。

```
AI Agent ←→ ocs-cli ←HTTP→ ocs-desktop ←Playwright→ Chrome + ocsjs
```

## 功能

- 浏览器控制：导航、点击、填写、截图、DOM 快照
- iframe 操作：递归搜索、题目提取、答案注入、提交
- 视频控制：播放、暂停、倍速、音量
- 课程导航：学习通/智慧树课程列表、章节、进入学习页
- 平台识别：自动检测 6 大课程平台
- 认证安全：令牌认证、CORS 限制、请求超时

## 快速开始

### 前置条件

- Node.js >= 20
- [ocs-desktop](https://github.com/ocsjs/ocs-desktop) 已启动，浏览器已打开

### 安装

```bash
git clone https://github.com/yourname/ocs-cli.git
cd ocs-cli
npm install
npm run build
npm link  # 全局安装 ocs 命令
```

### 使用

```bash
# 连接到 ocs-desktop
ocs connect

# 检查环境
ocs doctor

# 查看课程
ocs course list --json

# 进入章节
ocs course open <courseId> <clazzId> <chapterId>

# 检测视频
ocs video status

# 播放视频（2倍速）
ocs video autoplay -r 2

# 提取题目
ocs iframe questions 0 --json

# 答题
ocs iframe answer 0 "题目文本" "答案文本"
ocs iframe submit 0
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

ocs-cli 通过 HTTP API 与 ocs-desktop 的 Agent 服务通信（默认端口 17900）。

```bash
# 启动 API 代理服务
ocs connect --serve --port 17800

# Agent 通过 ocs-cli 的 API 操作浏览器
curl http://127.0.0.1:17800/agent/health
```

### MCP (可选)

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

`skill/SKILL.md` 包含完整的使用手册，任何 AI Agent 都能读取使用。

## 架构

```
ocs-cli/
├── src/
│   ├── browser/controller.ts    # 浏览器控制器（独立/Agent 双模式）
│   ├── server/index.ts          # HTTP API 代理服务
│   ├── platform/
│   │   ├── detector.ts          # 平台检测器（6平台）
│   │   └── ocs-bridge.ts        # ocsjs 逻辑桥接
│   ├── cli/index.ts             # CLI 命令
│   ├── mcp/                     # MCP 服务器（可选）
│   └── types.ts                 # 类型定义
├── skill/SKILL.md               # Agent 使用手册
└── reference/                   # ocsjs + ocs-desktop 源码（gitignore）
```

## 支持的平台

| 平台 | ID | 域名 |
|------|----|------|
| 超星学习通 | cx | chaoxing.com, edu.cn, xueyinonline.com |
| 智慧树 | zhs | zhihuishu.com, studywisdom.com |
| 智慧职教 | icve | icve.com.cn, courshare.cn |
| 职教云 | zjy | zjy2.icve.com.cn |
| 中国大学MOOC | icourse | icourse163.org |
| 雨课堂 | yuketang | yuketang.cn |

## 相关项目

- [ocsjs](https://github.com/ocsjs/ocsjs) — 网课自动化用户脚本
- [ocs-desktop](https://github.com/ocsjs/ocs-desktop) — 网课自动化桌面客户端

## 许可证

MIT
