# OCS-CLI Skill

网课自动化工具。通过 ocs-desktop 管理的浏览器，控制超星学习通等平台的课程学习。

## 使用前

1. 确认 ocs-desktop 已启动且浏览器已打开
2. 运行 `ocs connect` 连接 Agent 服务
3. 运行 `ocs doctor` 检查状态

## 核心命令

```bash
# 连接
ocs connect

# 课程操作
ocs cx courses                                    # 课程列表
ocs cx chapters <courseId> <clazzId>              # 章节列表
ocs cx study <courseId> <clazzId> <chapterId>     # 进入章节

# 页面感知
ocs page screenshot shot.png                      # 截图
ocs page snapshot                                 # DOM 快照
ocs page eval "document.title"                    # 执行 JS
ocs status                                        # 当前学习状态

# 元素操作
ocs click "#button"                               # 点击
ocs fill "#input" "text"                          # 填写
ocs press Enter                                   # 按键

# iframe 操作（课程内容在 iframe 内）
ocs iframe list                                   # 列出 iframe
ocs iframe eval 0 "document.body.innerText"       # iframe 内执行 JS
ocs iframe media 0                                # iframe 内媒体
ocs iframe questions 0                            # 提取题目

# 视频控制
ocs video status 0                                # 视频状态
ocs video autoplay 0 -r 2 -v 0.5                  # 2x 播放
ocs video pause 0                                 # 暂停

# 答题
ocs iframe answer 0 "题目文本" "答案文本"           # 单题答题
ocs iframe submit 0                               # 提交答案

# 配置
ocs config get                                    # 读取配置
ocs config set "common.settings.playbackRate" "2" # 改倍速
```

## 所有命令支持 --json 输出

```bash
ocs cx courses --json
ocs iframe questions 0 --json
ocs video status 0 --json
```

## 典型工作流

### 查看课程

```bash
ocs connect
ocs cx courses --json
```

### 进入章节并看视频

```bash
ocs cx study <courseId> <clazzId> <chapterId>
ocs iframe list
ocs video status 0
ocs video autoplay 0 -r 2
# 等待视频播放完成
ocs video status 0  # 检查 ended: true
```

### 答题

```bash
ocs iframe questions 0 --json
# Agent 根据题目内容推理答案
ocs iframe answer 0 "题目文本" "答案文本"
ocs iframe submit 0
```

### 检测当前页面任务

```bash
ocs status
ocs iframe list
ocs iframe media 0      # 有媒体 → 视频任务
ocs iframe questions 0   # 有题目 → 答题任务
```

## 注意事项

- 课程内容在 iframe 内（通常是 `knowledge/cards`），需要先 `ocs iframe list` 找到正确的 iframe index
- `--json` 输出适合程序解析，默认输出适合人类阅读
- 浏览器生命周期由 ocs-desktop GUI 管理，ocs-cli 不启动浏览器
- OCR 验证码: `ocs ocr <image_path>` 调用 ocs-desktop 的 OCR 服务
