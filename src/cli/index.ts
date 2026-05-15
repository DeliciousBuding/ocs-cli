import { Command } from "commander";
import chalk from "chalk";
import { BrowserController } from "../browser/controller.js";
import { createServer } from "../server/index.js";
import { PlatformDetector } from "../platform/detector.js";

const controller = new BrowserController();
const detector = new PlatformDetector();

/** Agent HTTP 服务基础 URL */
let agentBaseUrl = "http://127.0.0.1:17900";

async function agentFetch(path: string, options?: RequestInit): Promise<any> {
  const resp = await fetch(`${agentBaseUrl}${path}`, options);
  return resp.json();
}

function agentPost(path: string, body: any): Promise<any> {
  return agentFetch(path, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify(body),
  });
}

function output(data: any, jsonMode: boolean) {
  if (jsonMode) {
    console.log(JSON.stringify(data, null, 2));
  } else if (typeof data === "string") {
    console.log(data);
  } else {
    for (const [k, v] of Object.entries(data)) {
      console.log(chalk.cyan(k + ":") + " " + String(v));
    }
  }
}

export function createCLI(): Command {
  const program = new Command();

  program
    .name("ocs")
    .description("OCS-CLI — AI Agent 的网课自动化工具箱")
    .version("0.1.0")
    .option("--json", "JSON 输出", false)
    .option("--agent <url>", "Agent 服务地址", "http://127.0.0.1:17900");

  // ── 连接 ──
  program
    .command("connect")
    .description("连接到 ocs-desktop 的 Agent 服务")
    .action(async () => {
      agentBaseUrl = program.opts().agent;
      try {
        // 自动发现
        const discover = await fetch("http://127.0.0.1:15319/agent").then(r => r.json()).catch(() => null) as any;
        if (discover?.agentUrl) agentBaseUrl = discover.agentUrl;

        const health = await agentFetch("/agent/health");
        if (health.status === "ok") {
          console.log(chalk.green(`已连接 ${agentBaseUrl}`));
          console.log(chalk.gray(`浏览器: ${health.hasBrowser ? "是" : "否"}, 页面: ${health.pages}`));
        } else {
          console.log(chalk.red("Agent 服务异常"));
        }
      } catch {
        console.log(chalk.red(`无法连接 ${agentBaseUrl}`));
        console.log(chalk.gray("请确认 ocs-desktop 已启动且浏览器已打开"));
      }
    });

  // ── 医生 ──
  program.command("doctor").description("检查环境").action(async () => {
    console.log(chalk.cyan("OCS-CLI 环境检查\n"));
    console.log(`平台: ${process.platform}`);
    console.log(`Node: ${process.version}`);
    // 检查 Agent 服务
    try {
      const h = await agentFetch("/agent/health");
      console.log(chalk.green(`Agent 服务: 在线 (${agentBaseUrl})`));
      console.log(`浏览器: ${h.hasBrowser ? "运行中" : "未启动"}, 页面: ${h.pages}`);
    } catch {
      console.log(chalk.yellow(`Agent 服务: 离线`));
    }
    console.log(`\n支持平台:`);
    for (const p of detector.listPlatforms()) {
      console.log(chalk.gray(`  ${p.name} (${p.id})`));
    }
  });

  // ══════════════════════════════════════════
  // 页面操作
  // ══════════════════════════════════════════

  const page = program.command("page").description("页面操作");

  page.command("list").description("列出页面").action(async () => {
    const pages = await agentFetch("/agent/pages");
    const json = program.opts().json;
    if (json) { console.log(JSON.stringify(pages, null, 2)); return; }
    for (const p of pages) console.log(`[${p.index}] ${p.url} — ${p.title}`);
  });

  page.command("navigate <url>").description("导航到 URL").action(async (url: string) => {
    const r = await agentPost("/agent/navigate", { url });
    output(r, program.opts().json);
  });

  page.command("new [url]").description("新建页面").action(async (url?: string) => {
    const r = await agentPost("/agent/newPage", { url });
    output(r, program.opts().json);
  });

  page.command("screenshot [file]").description("截图").option("--full-page", "完整页面").action(async (file?: string, opts?: any) => {
    const data = await agentFetch(`/agent/screenshot?fullPage=${opts?.fullPage || false}`);
    if (file) {
      const { writeFileSync } = await import("node:fs");
      writeFileSync(file, Buffer.from(data.screenshot, "base64"));
      console.log(chalk.green(`已保存: ${file}`));
    } else {
      console.log(data.screenshot);
    }
  });

  page.command("snapshot").description("DOM 快照").action(async () => {
    const data = await agentFetch("/agent/snapshot");
    console.log(data.snapshot);
  });

  page.command("eval <expr>").description("执行 JavaScript").action(async (expr: string) => {
    const r = await agentPost("/agent/eval", { expression: expr });
    output(r.result ?? r, program.opts().json);
  });

  page.command("content").description("获取 HTML").action(async () => {
    const r = await agentFetch("/agent/content");
    console.log(r.content);
  });

  // ══════════════════════════════════════════
  // 元素操作
  // ══════════════════════════════════════════

  program.command("click <selector>").description("点击元素").action(async (sel: string) => {
    output(await agentPost("/agent/click", { selector: sel }), program.opts().json);
  });

  program.command("fill <selector> <value>").description("填写输入框").action(async (sel: string, val: string) => {
    output(await agentPost("/agent/fill", { selector: sel, value: val }), program.opts().json);
  });

  program.command("press <key>").description("按键").action(async (key: string) => {
    output(await agentPost("/agent/press", { key }), program.opts().json);
  });

  program.command("wait <selector>").description("等待元素").option("-t, --timeout <ms>", "超时", "30000").action(async (sel: string, opts: any) => {
    output(await agentPost("/agent/waitFor", { selector: sel, timeout: Number(opts.timeout) }), program.opts().json);
  });

  // ══════════════════════════════════════════
  // iframe 操作
  // ══════════════════════════════════════════

  const iframe = program.command("iframe").description("iframe 操作");

  iframe.command("list").description("列出 iframe").action(async () => {
    const r = await agentFetch("/agent/iframes");
    const json = program.opts().json;
    if (json) { console.log(JSON.stringify(r, null, 2)); return; }
    for (const f of r) console.log(`[${f.index}] ${f.src?.slice(0, 80)} ${f.accessible ? chalk.green("可访问") : chalk.red("跨域")}`);
  });

  iframe.command("eval <index> <expr>").description("iframe 内执行 JS").action(async (idx: string, expr: string) => {
    const r = await agentPost("/agent/iframe-eval", { iframeIndex: Number(idx), expression: expr });
    output(r.result ?? r, program.opts().json);
  });

  iframe.command("media <index>").description("iframe 内媒体").action(async (idx: string) => {
    output(await agentPost("/agent/iframe-media", { iframeIndex: Number(idx) }), program.opts().json);
  });

  iframe.command("questions <index>").description("iframe 内题目").action(async (idx: string) => {
    const r = await agentPost("/agent/iframe-questions", { iframeIndex: Number(idx) });
    const json = program.opts().json;
    if (json) { console.log(JSON.stringify(r, null, 2)); return; }
    for (const q of r) {
      console.log(`[${q.type}] ${q.text?.slice(0, 60)}`);
      for (const o of q.options?.slice(0, 4) ?? []) console.log(chalk.gray(`  - ${o.text}`));
    }
  });

  iframe.command("answer <index> <question> <answer>").description("选择答案").option("-m, --mode <mode>", "匹配模式", "similar").action(async (idx: string, q: string, a: string, opts: any) => {
    output(await agentPost("/agent/iframe-answer", { iframeIndex: Number(idx), questionText: q, answerText: a, matchMode: opts.mode }), program.opts().json);
  });

  iframe.command("submit <index>").description("提交答案").action(async (idx: string) => {
    output(await agentPost("/agent/iframe-submit", { iframeIndex: Number(idx) }), program.opts().json);
  });

  // ══════════════════════════════════════════
  // 视频控制
  // ══════════════════════════════════════════

  const video = program.command("video").description("视频控制");

  video.command("status <index>").description("视频状态").action(async (idx: string) => {
    output(await agentPost("/agent/video/status", { iframeIndex: Number(idx) }), program.opts().json);
  });

  video.command("play <index>").description("播放").action(async (idx: string) => {
    output(await agentPost("/agent/video/play", { iframeIndex: Number(idx) }), program.opts().json);
  });

  video.command("pause <index>").description("暂停").action(async (idx: string) => {
    output(await agentPost("/agent/video/pause", { iframeIndex: Number(idx) }), program.opts().json);
  });

  video.command("rate <index> <rate>").description("设置倍速").action(async (idx: string, rate: string) => {
    output(await agentPost("/agent/video/setRate", { iframeIndex: Number(idx), rate: Number(rate) }), program.opts().json);
  });

  video.command("autoplay <index>").description("自动播放").option("-r, --rate <rate>", "倍速", "1").option("-v, --volume <vol>", "音量", "1").action(async (idx: string, opts: any) => {
    output(await agentPost("/agent/video/autoPlay", { iframeIndex: Number(idx), rate: Number(opts.rate), volume: Number(opts.volume) }), program.opts().json);
  });

  // ══════════════════════════════════════════
  // 课程导航（学习通）
  // ══════════════════════════════════════════

  const cx = program.command("cx").description("学习通课程操作");

  cx.command("courses").description("获取课程列表").action(async () => {
    const r = await agentPost("/agent/cx/courses", {});
    const json = program.opts().json;
    if (json) { console.log(JSON.stringify(r, null, 2)); return; }
    for (const c of r.courses ?? []) console.log(`  ${c.name} (${c.courseId})`);
  });

  cx.command("chapters <courseId> <clazzId>").description("获取章节列表").action(async (cid: string, clid: string) => {
    const r = await agentPost("/agent/cx/chapters", { courseId: cid, clazzId: clid });
    const json = program.opts().json;
    if (json) { console.log(JSON.stringify(r, null, 2)); return; }
    for (const ch of r) console.log(`${ch.completed ? "✅" : "⬜"} ${ch.text?.slice(0, 50)} [${ch.chapterId}]`);
  });

  cx.command("study <courseId> <clazzId> <chapterId>").description("进入章节学习").action(async (cid: string, clid: string, chid: string) => {
    const r = await agentPost("/agent/cx/study", { courseId: cid, clazzId: clid, chapterId: chid });
    output(r, program.opts().json);
  });

  // ══════════════════════════════════════════
  // 自动学习状态
  // ══════════════════════════════════════════

  program.command("status").description("当前学习状态").action(async () => {
    const r = await agentFetch("/agent/auto-study/status");
    const json = program.opts().json;
    if (json) { console.log(JSON.stringify(r, null, 2)); return; }
    console.log(chalk.cyan("URL:"), r.url?.slice(0, 100));
    console.log(chalk.cyan("标题:"), r.title);
    console.log(chalk.cyan("任务:"), r.tasks?.join(", ") || "无");
    console.log(chalk.cyan("iframe:"), r.iframes?.length || 0);
  });

  // ══════════════════════════════════════════
  // 登录
  // ══════════════════════════════════════════

  const login = program.command("login").description("登录操作");

  login.command("cx-phone").description("学习通手机登录").requiredOption("--phone <phone>").requiredOption("--password <password>").action(async (opts: any) => {
    output(await agentPost("/agent/login/cx-phone", { phone: opts.phone, password: opts.password }), program.opts().json);
  });

  // ══════════════════════════════════════════
  // OCR
  // ══════════════════════════════════════════

  program.command("ocr <image>").description("OCR 验证码识别 (base64 或文件路径)").action(async (image: string) => {
    const { readFileSync, existsSync } = await import("node:fs");
    let b64 = image;
    if (existsSync(image)) b64 = readFileSync(image).toString("base64");
    output(await agentPost("/agent/ocr", { image: b64 }), program.opts().json);
  });

  // ══════════════════════════════════════════
  // 配置
  // ══════════════════════════════════════════

  const config = program.command("config").description("ocsjs 配置管理");

  config.command("get").description("读取配置").action(async () => {
    output(await agentFetch("/agent/config"), program.opts().json);
  });

  config.command("set <key> <value>").description("修改配置").action(async (key: string, value: string) => {
    let parsed: any = value;
    try { parsed = JSON.parse(value); } catch {}
    output(await agentPost("/agent/config/set", { key, value: parsed }), program.opts().json);
  });

  config.command("cache").description("查看答案缓存").action(async () => {
    output(await agentFetch("/agent/config/cache"), program.opts().json);
  });

  config.command("clear-cache").description("清空答案缓存").action(async () => {
    const r = await fetch(`${agentBaseUrl}/agent/config/cache`, { method: "DELETE" }).then(r => r.json());
    output(r, program.opts().json);
  });

  return program;
}

const program = createCLI();
program.parse(process.argv);
