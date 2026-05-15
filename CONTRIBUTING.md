# 贡献指南

感谢你对 OCS-CLI 的兴趣！

## 开发环境

```bash
git clone https://github.com/DeliciousBuding/ocs-cli.git
cd ocs-cli
npm install
npm run build
npm link
```

需要 Node.js >= 20。

## 开发流程

1. Fork 仓库，从 `master` 创建分支
2. 修改代码
3. 验证：
   ```bash
   npm run build
   npm run typecheck
   ```
4. 用 `ocs --help` 检查 CLI 输出
5. 提交 PR

## 提交规范

使用 [Conventional Commits](https://www.conventionalcommits.org/)：

- `feat:` 新功能
- `fix:` 修复
- `docs:` 文档
- `refactor:` 重构
- `test:` 测试
- `chore:` 杂项

## 代码风格

- TypeScript strict 模式
- 所有命令支持 `--json` 输出
- 错误信息要对用户友好

## 安全

不要在代码、Issue、PR 中提交：
- API Key
- 密码
- Token
- 个人课程信息
