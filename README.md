# OCS-CLI

> AI Agent 的网课自动化工具箱

[![CI](https://github.com/DeliciousBuding/ocs-cli/actions/workflows/ci.yml/badge.svg)](https://github.com/DeliciousBuding/ocs-cli/actions)
[![License: MIT](https://img.shields.io/badge/License-MIT-blue.svg)](LICENSE)

## 这是什么

OCS-CLI 让 AI Agent（比如 Claude Code、Codex）能够帮你自动刷网课。

它基于 [ocsjs](https://github.com/ocsjs/ocsjs) 的识别能力和 [ocs-desktop](https://github.com/ocsjs/ocs-desktop) 的浏览器管理，通过 HTTP API 暴露给 AI Agent 使用。

```
你 → AI Agent → ocs-cli → ocs-desktop → Chrome + ocsjs → 网课网站
```

## 为什么做这个

- 网课耗时间，但大部分内容是重复性的
- 传统题库不一定准，LLM 可以推理答案
- ocsjs 已经很强大了，但只能在浏览器里手动触发
- 如果 Agent 能控制 ocsjs，就能全自动完成

## 感谢

本项目站在巨人的肩膀上：

- **[ocsjs](https://github.com/ocsjs/ocsjs)** — 核心识别和自动化逻辑，支持 6 大课程平台
- **[ocs-desktop](https://github.com/ocsjs/ocs-desktop)** — 浏览器管理和用户脚本注入
- 感谢 [enncy](https://github.com/enncy) 和所有 ocsjs/ocs-desktop 贡献者的工作

## 安装

```bash
git clone https://github.com/DeliciousBuding/ocs-cli.git
cd ocs-cli
npm install
npm run build
npm link
```

前置条件：
- Node.js >= 20
- [ocs-desktop](https://github.com/ocsjs/ocs-desktop) 已启动

## 使用

```bash
# 连接 ocs-desktop
ocs connect

# 查看课程
ocs course list --json

# 进入章节
ocs course open <courseId> <clazzId> <chapterId>

# 启动答案服务（给 ocsjs 提供答案）
ocs answer start

# 配置 LLM 答案源
ocs answer-config llm --api <url> --model <model> --key <key>

# 查看答案缓存
ocs answer cache
```

## 答案服务

OCS-CLI 提供一个 HTTP 答案服务，ocsjs 会自动查询它：

```
ocsjs 检测到题目
  → 查询 ocs-cli 答案服务 (localhost:17901)
  → 答案来源（按优先级）：
      1. 本地缓存（已答过的题）
      2. 题库 API（用户配置的付费题库）
      3. LLM API（用户配置的大模型）
      4. Agent 队列（等 AI Agent 回答）
```

配置方式：

```bash
# 添加题库
ocs answer-config tiku --name "我的题库" --url "https://api.example.com/query"

# 配置 LLM
ocs answer-config llm --api "https://api.openai.com/v1/chat/completions" --model "gpt-4o" --key "sk-..."

# 设置置信度阈值
ocs answer-config mode --confidence 0.6
```

## 命令速查

```
ocs doctor              # 环境检查
ocs connect             # 连接 ocs-desktop
ocs detect <url>        # 检测课程平台

ocs page list/open/screenshot/snapshot/eval
ocs act click/fill/press/hover/wait
ocs iframe list/eval/media/questions
ocs video status/play/pause/rate/autoplay
ocs course list/chapters/open/remaining
ocs zhs courses/video/login-status

ocs answer start        # 启动答案服务
ocs answer query "题目"  # 查询答案
ocs answer-config tiku/llm  # 配置答案源

ocs request <method> <path>  # 原始 API
```

所有命令支持 `--json` 输出。

## 支持的平台

| 平台 | 状态 |
|------|------|
| 超星学习通 | ✅ 基本可用 |
| 智慧树 | ⚠️ 部分可用 |
| 智慧职教 | 🔲 待开发 |
| 职教云 | 🔲 待开发 |
| 中国大学MOOC | 🔲 待开发 |
| 雨课堂 | 🔲 待开发 |

## 开发

```bash
npm install
npm run build
npm run dev -- doctor
npm run typecheck
```

详见 [CONTRIBUTING.md](CONTRIBUTING.md)。

## 许可证

[MIT](LICENSE)
