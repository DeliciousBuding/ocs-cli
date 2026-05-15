---
name: ocs-cli
description: |
  网课自动化工具箱 CLI。用于控制超星学习通等平台的课程学习。
  当用户提到网课、刷课、学习通、答题、课程视频时使用此 skill。
---

# OCS-CLI

AI Agent 的网课自动化工具箱。通过 ocs-desktop 管理的浏览器控制课程学习。

## 验证安装

```bash
ocs --version
ocs doctor --json
```

## 连接

```bash
ocs connect --json
```

确认 `connected: true`，`browser: true`。

## 发现课程

```bash
ocs course list --json
```

返回课程列表，每项有 `name`、`courseId`、`clazzId`。

## 获取章节

```bash
ocs course chapters <courseId> <clazzId> --json
```

返回章节列表，每项有 `text`、`chapterId`、`completed`。

## 进入章节

```bash
ocs course open <courseId> <clazzId> <chapterId>
```

## 检测任务类型

```bash
ocs status --json
ocs iframe list --json
```

iframe[0] 通常是 `knowledge/cards`（课程内容 iframe）。

## 视频任务

```bash
ocs video status 0 --json          # 检查视频状态
ocs video autoplay 0 -r 2 -v 0.5   # 2x 播放
ocs video status 0 --json           # 等播放完再查
```

## 答题任务

```bash
ocs iframe questions 0 --json       # 提取题目
# Agent 推理答案
ocs iframe answer 0 "题目文本" "答案文本"
ocs iframe submit 0                 # 提交
```

批量答题:
```bash
ocs iframe batch 0 --answers '[{"questionText":"题目","answerText":"答案"}]' --submit
```

## 规则

- 先 `ocs connect` 再操作。
- 用 `--json` 获取结构化输出。
- 浏览器由 ocs-desktop GUI 管理，ocs-cli 不启动浏览器。
- `ocs request` 可直接调用任何 Agent API 端点。
- 不确定答案时不要自动提交。

## 三个示例

```bash
# 1. 查看课程
ocs course list --json

# 2. 播放视频
ocs course open 255834521 129011174 1055353493
ocs video autoplay 0 -r 2

# 3. 答题
ocs iframe questions 0 --json
ocs iframe answer 0 "什么是分治法" "将问题分解为子问题分别求解"
ocs iframe submit 0
```
