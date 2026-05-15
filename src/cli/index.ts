import { Command } from "commander";
import chalk from "chalk";
import { BrowserController } from "../browser/controller.js";
import { createServer } from "../server/index.js";
import { PlatformDetector } from "../platform/detector.js";
import { OCSBridge } from "../platform/ocs-bridge.js";

const controller = new BrowserController();
const detector = new PlatformDetector();
const bridge = new OCSBridge(controller);

export function createCLI(): Command {
  const program = new Command();

  program
    .name("ocs")
    .description("OCS-CLI — AI Agent 浏览器自动化工具，复用 ocsjs 识别逻辑")
    .version("0.1.0");

  // ── 启动浏览器 ──
  program
    .command("launch")
    .description("启动浏览器实例")
    .option("-e, --executable-path <path>", "Chrome/Edge 可执行文件路径")
    .option("--headless", "无头模式运行", false)
    .option("--port <port>", "API 服务端口", "17800")
    .option("--host <host>", "API 服务监听地址", "127.0.0.1")
    .option("--auth-token <token>", "API 认证令牌")
    .option("-u, --url <url>", "启动后导航到指定 URL")
    .option("--proxy <url>", "代理服务器地址")
    .option("-s, --serve", "同时启动 HTTP API 服务", false)
    .action(async (opts) => {
      try {
        console.log(chalk.cyan("正在启动浏览器..."));
        const result = await controller.launch({
          executablePath: opts.executablePath,
          headless: opts.headless,
          proxy: opts.proxy,
        });
        console.log(chalk.green(`浏览器已启动 ID: ${result.browserId}`));
        console.log(chalk.gray(`页面数: ${result.pages.length}`));

        if (opts.url) {
          await controller.navigate(opts.url, result.browserId);
          console.log(chalk.green(`已导航到: ${opts.url}`));
        }

        if (opts.serve) {
          const server = createServer(controller, {
            port: Number(opts.port),
            host: opts.host,
            authToken: opts.authToken,
          });
          const port = await server.start();
          console.log(chalk.green(`API 服务已启动: http://${opts.host}:${port}`));
          console.log(chalk.gray("按 Ctrl+C 停止所有服务"));

          process.on("SIGINT", async () => {
            console.log(chalk.yellow("\n正在关闭..."));
            await server.stop();
            await controller.closeAll();
            process.exit(0);
          });

          // Keep alive
          await new Promise(() => {});
        } else {
          // Without --serve, just launch and print info
          const platform = opts.url ? detector.detect(opts.url) : null;
          if (platform) {
            console.log(chalk.cyan(`检测到平台: ${platform.name}`));
          }
          console.log(chalk.gray("使用 'ocs serve' 启动 API 服务供 Agent 调用"));
          await controller.close();
        }
      } catch (e: any) {
        console.error(chalk.red(`启动失败: ${e.message}`));
        process.exit(1);
      }
    });

  // ── 启动 API 服务 ──
  program
    .command("serve")
    .description("启动 HTTP API 服务（供 Agent 调用）")
    .option("-p, --port <port>", "服务端口", "17800")
    .option("--host <host>", "监听地址", "127.0.0.1")
    .option("--auth-token <token>", "认证令牌")
    .option("-e, --executable-path <path>", "Chrome/Edge 路径")
    .option("--headless", "无头模式", false)
    .action(async (opts) => {
      try {
        console.log(chalk.cyan("正在启动浏览器..."));
        const result = await controller.launch({
          executablePath: opts.executablePath,
          headless: opts.headless,
        });
        console.log(chalk.green(`浏览器已启动 ID: ${result.browserId}`));

        const server = createServer(controller, {
          port: Number(opts.port),
          host: opts.host,
          authToken: opts.authToken,
        });
        const port = await server.start();
        console.log(chalk.green(`API 服务已启动: http://${opts.host}:${port}`));
        console.log(chalk.gray("API 文档: GET /doctor  查看所有端点"));
        console.log(chalk.gray("按 Ctrl+C 停止"));

        process.on("SIGINT", async () => {
          console.log(chalk.yellow("\n正在关闭..."));
          await server.stop();
          await controller.closeAll();
          process.exit(0);
        });

        await new Promise(() => {});
      } catch (e: any) {
        console.error(chalk.red(`启动失败: ${e.message}`));
        process.exit(1);
      }
    });

  // ── 状态检查 ──
  program
    .command("doctor")
    .description("检查运行环境和浏览器状态")
    .action(async () => {
      console.log(chalk.cyan("OCS-CLI 环境检查\n"));
      console.log(`平台: ${process.platform}`);
      console.log(`Node: ${process.version}`);
      console.log(`Chrome/Edge: ${detector.listPlatforms().length} 个平台已配置`);
      console.log(`运行中的浏览器: ${controller.listBrowsers().length}`);
      console.log(`支持的平台:`);
      for (const p of detector.listPlatforms()) {
        console.log(chalk.gray(`  - ${p.name} (${p.domains.join(", ")})`));
      }
    });

  // ── 平台检测 ──
  program
    .command("detect <url>")
    .description("检测 URL 对应的课程平台")
    .action((url) => {
      const result = detector.detect(url);
      if (result) {
        console.log(chalk.green(`检测到平台: ${result.name} (${result.id})`));
        console.log(chalk.gray(`域名: ${result.domains.join(", ")}`));
      } else {
        console.log(chalk.yellow("未识别到已支持的课程平台"));
        console.log(chalk.gray("支持的平台:"));
        for (const p of detector.listPlatforms()) {
          console.log(chalk.gray(`  - ${p.name}: ${p.domains.join(", ")}`));
        }
      }
    });

  // ── 页面分析 ──
  program
    .command("analyze")
    .description("分析当前页面（提取题目、媒体等）")
    .option("-b, --browser-id <id>", "浏览器 ID")
    .option("-p, --page-index <index>", "页面索引", "0")
    .action(async (opts) => {
      try {
        const result = await bridge.analyzePage(opts.browserId, Number(opts.pageIndex));
        console.log(chalk.cyan("页面分析结果:\n"));
        console.log(`URL: ${result.url}`);
        console.log(`标题: ${result.title}`);
        console.log(`平台: ${result.platform ?? "未知"}`);
        console.log(`题目数: ${result.questions.length}`);
        console.log(`媒体数: ${result.media.length}`);

        if (result.questions.length > 0) {
          console.log(chalk.cyan("\n── 题目 ──"));
          for (const q of result.questions) {
            console.log(chalk.white(`\n[${q.type}] ${q.text}`));
            for (const opt of q.options) {
              console.log(chalk.gray(`  - ${opt.text}`));
            }
          }
        }

        if (result.media.length > 0) {
          console.log(chalk.cyan("\n── 媒体 ──"));
          for (const m of result.media) {
            console.log(`${m.type}: ${m.paused ? "已暂停" : "播放中"} (${m.playbackRate}x) ${m.currentTime.toFixed(1)}/${m.duration.toFixed(1)}s`);
          }
        }
      } catch (e: any) {
        console.error(chalk.red(`分析失败: ${e.message}`));
        process.exit(1);
      }
    });

  // ── 快速命令 ──
  program
    .command("screenshot")
    .description("截取当前页面截图")
    .option("-b, --browser-id <id>", "浏览器 ID")
    .option("-p, --page-index <index>", "页面索引", "0")
    .option("-o, --output <file>", "保存文件路径")
    .option("--full-page", "截取完整页面", false)
    .action(async (opts) => {
      try {
        const b64 = await controller.screenshot(
          { fullPage: opts.fullPage },
          opts.browserId,
          Number(opts.pageIndex)
        );
        if (opts.output) {
          const { writeFileSync } = await import("node:fs");
          writeFileSync(opts.output, Buffer.from(b64, "base64"));
          console.log(chalk.green(`截图已保存: ${opts.output}`));
        } else {
          console.log(b64);
        }
      } catch (e: any) {
        console.error(chalk.red(`截图失败: ${e.message}`));
        process.exit(1);
      }
    });

  program
    .command("navigate <url>")
    .description("导航到指定 URL")
    .option("-b, --browser-id <id>", "浏览器 ID")
    .option("-p, --page-index <index>", "页面索引", "0")
    .action(async (url, opts) => {
      try {
        await controller.navigate(url, opts.browserId, Number(opts.pageIndex));
        console.log(chalk.green(`已导航到: ${url}`));
        const platform = detector.detect(url);
        if (platform) console.log(chalk.cyan(`平台: ${platform.name}`));
      } catch (e: any) {
        console.error(chalk.red(`导航失败: ${e.message}`));
        process.exit(1);
      }
    });

  program
    .command("eval <expression>")
    .description("在页面中执行 JavaScript 表达式")
    .option("-b, --browser-id <id>", "浏览器 ID")
    .option("-p, --page-index <index>", "页面索引", "0")
    .action(async (expression, opts) => {
      try {
        const result = await controller.evaluate(expression, opts.browserId, Number(opts.pageIndex));
        console.log(JSON.stringify(result, null, 2));
      } catch (e: any) {
        console.error(chalk.red(`执行失败: ${e.message}`));
        process.exit(1);
      }
    });

  return program;
}

// 执行 CLI
const program = createCLI();
program.parse(process.argv);
