# Changelog

## 0.2.0 (2026-05-16)

### 新增
- 答案服务（cache → 题库 → LLM → Agent 队列）
- LLM API 集成
- 学习通/智慧树课程导航
- iframe 操作（递归搜索、题目提取）
- ocs-desktop Agent 服务（纯 Playwright 代理）

### 重构
- ocs-desktop PR 精简为纯 Playwright 代理（~250 行）
- 平台逻辑全部移至 ocs-cli

## 0.1.0 (2026-05-15)

### 新增
- 项目初始化
- CLI 命令框架
- 基础浏览器控制
