---
name: ocs-cli
description: |
  网课自动化工具箱 CLI。用于控制超星学习通、智慧树等平台的课程学习。
  当用户提到网课、刷课、学习通、智慧树、答题、课程视频、自动学习时使用此 skill。
---

# OCS-CLI

AI Agent 的网课自动化工具箱。通过 ocs-desktop 管理的浏览器控制课程学习。

## 前置条件

ocs-desktop 已启动且浏览器已打开。运行 `ocs connect` 确认连接。

## 连接与诊断

```bash
ocs connect --json             # 连接 ocs-desktop（自动发现端口）
ocs doctor --json              # 环境检查
ocs detect <url>               # 检测课程平台
```

## 页面操作

```bash
ocs page list --json                    # 列出所有页面
ocs page open <url>                     # 导航到 URL
ocs page new [url]                      # 新建页面
ocs page screenshot [file] [--full]     # 截图
ocs page snapshot                       # DOM 快照
ocs page eval <expression>              # 执行 JS
ocs page content                        # 获取 HTML
ocs page url                            # 当前 URL
```

## 元素操作

```bash
ocs act click <selector>                # 点击
ocs act fill <selector> <value>         # 填写
ocs act press <key>                     # 按键（Enter, Tab 等）
ocs act hover <selector>                # 悬停
ocs act wait <selector> [-t timeout]    # 等待元素
```

## iframe 操作（课程内容在 iframe 内）

```bash
ocs iframe list                         # 列出 iframe
ocs iframe eval <index> <expression>    # iframe 内执行 JS
ocs iframe media <index>                # iframe 内媒体检测
ocs iframe questions <index>            # 提取题目
ocs iframe answer <index> "题目" "答案"  # 选择答案
ocs iframe submit <index>               # 提交答案
ocs iframe batch <index> --answers '...' [--submit]  # 批量答题
```

## 视频控制

```bash
ocs video status [-p pageIndex]         # 视频状态
ocs video play [-p pageIndex]           # 播放
ocs video pause [-p pageIndex]          # 暂停
ocs video rate <rate> [-p pageIndex]    # 设置倍速
ocs video autoplay [-r rate] [-v vol]   # 自动播放
```

## 学习通课程

```bash
ocs course list                         # 课程列表
ocs course chapters <courseId> <clazzId>  # 章节列表
ocs course open <courseId> <clazzId> <chapterId>  # 进入章节
ocs course remaining <courseId> <clazzId>  # 未完成章节
```

## 智慧树

```bash
ocs zhs courses                         # 课程列表
ocs zhs video                           # 视频状态
ocs zhs login-status                    # 登录状态
ocs zhs login-phone --phone X --password X  # 手机登录
ocs zhs login-school --school X --id X --password X  # 学校登录
```

## 登录与 OCR

```bash
ocs login --phone X --password X        # 学习通手机登录
ocs ocr <image_path>                    # OCR 验证码识别
```

## 配置

```bash
ocs config get                          # 读取 ocsjs 配置
ocs config set <key> <value>            # 修改配置
ocs config cache                        # 查看答案缓存
ocs config clear-cache                  # 清空缓存
```

## 原始请求

```bash
ocs request GET /agent/health           # 原始 API 请求
ocs request POST /agent/eval --body '{"expression":"1+1"}'
```

## 典型工作流

```
1. ocs connect
2. ocs course list --json → 找到 courseId, clazzId
3. ocs course chapters <cid> <clid> --json → 找未完成 chapterId
4. ocs course open <cid> <clid> <chid>
5. ocs iframe list → 找到 content iframe
6. ocs iframe media 0 → 有媒体? → ocs video autoplay -r 2
7. ocs iframe questions 0 → 有题目? → Agent 推理 → ocs iframe answer → ocs iframe submit
```

## 规则

- 先 `ocs connect` 再操作。
- 用 `--json` 获取结构化输出。
- 浏览器由 ocs-desktop 管理，ocs-cli 不启动浏览器。
- 视频命令的 `-p` 参数指定浏览器页面索引（不是 iframe 索引）。
- 不确定答案时不要自动提交。
