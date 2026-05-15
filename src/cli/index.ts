import { Command } from "commander";
import chalk from "chalk";
import { PlatformDetector } from "../platform/detector.js";
import { AnswerService } from "../answer/service.js";
import { registerAnswerCommands } from "../answer/commands.js";

const detector = new PlatformDetector();
const answerService = new AnswerService();

/** Agent HTTP 服务基础 URL */
let agentBaseUrl = "http://127.0.0.1:17900";
let jsonMode = false;

async function api(path: string, options?: RequestInit): Promise<any> {
  try {
    const resp = await fetch(`${agentBaseUrl}${path}`, options);
    if (!resp.ok) {
      const text = await resp.text().catch(() => "");
      let msg = text;
      try { msg = JSON.parse(text).error || text; } catch {}
      throw new Error(`HTTP ${resp.status}: ${msg}`);
    }
    return resp.json();
  } catch (e: any) {
    if (e.message?.includes("fetch failed") || e.message?.includes("ECONNREFUSED")) {
      throw new Error("Agent 服务未运行。先执行: ocs connect");
    }
    throw e;
  }
}

function post(path: string, body: any): Promise<any> {
  return api(path, { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify(body) });
}

function out(data: any) {
  if (jsonMode) {
    console.log(JSON.stringify(data, null, 2));
  } else if (Array.isArray(data)) {
    for (const item of data) {
      if (typeof item === "object") {
        const name = item.name || item.text || item.title || item.url || "";
        const id = item.id || item.index || item.courseId || item.chapterId || "";
        console.log(`  ${name}${id ? ` [${id}]` : ""}`);
      } else {
        console.log(`  ${item}`);
      }
    }
  } else if (typeof data === "object" && data !== null) {
    for (const [k, v] of Object.entries(data)) {
      console.log(`${chalk.cyan(k)}: ${typeof v === "object" ? JSON.stringify(v) : String(v)}`);
    }
  } else {
    console.log(String(data));
  }
}

function log(msg: string) {
  console.error(chalk.gray(msg));
}

async function ensureConnected(): Promise<boolean> {
  try {
    const h = await api("/agent/health");
    if (h.status === "ok") return true;
  } catch {}
  console.error(chalk.red("未连接。运行 ocs connect 先。"));
  return false;
}

export function createCLI(): Command {
  const program = new Command();

  program
    .name("ocs")
    .description("网课自动化工具箱 — AI Agent 的浏览器操作接口")
    .version("0.1.0")
    .option("--json", "JSON 输出", false)
    .option("--agent <url>", "Agent 服务地址", "http://127.0.0.1:17900");

  program.hook("preAction", (thisCmd) => {
    jsonMode = thisCmd.opts().json || false;
    agentBaseUrl = thisCmd.opts().agent || "http://127.0.0.1:17900";
  });

  // ══════════════════════════════════════════
  // 发现 & 诊断
  // ══════════════════════════════════════════

  program
    .command("doctor")
    .description("检查环境和服务状态")
    .action(async () => {
      const result: any = { platform: process.platform, node: process.version, agent: { status: "离线" }, platforms: [] };
      try {
        const h = await api("/agent/health");
        result.agent = { status: "在线", url: agentBaseUrl, browser: h.hasBrowser, pages: h.pages };
      } catch {}
      result.platforms = detector.listPlatforms().map((p) => ({ id: p.id, name: p.name, domains: p.domains }));
      out(result);
    });

  program
    .command("connect")
    .description("连接到 ocs-desktop Agent 服务")
    .action(async () => {
      try {
        const discover = await fetch("http://127.0.0.1:15319/agent").then((r) => r.json()).catch(() => null) as any;
        if (discover?.agentUrl) agentBaseUrl = discover.agentUrl;
        const health = await api("/agent/health");
        if (health.status === "ok") {
          out({ connected: true, url: agentBaseUrl, browser: health.hasBrowser, pages: health.pages });
        } else {
          out({ connected: false, error: "服务异常" });
        }
      } catch {
        out({ connected: false, url: agentBaseUrl, error: "ocs-desktop 未运行" });
      }
    });

  program
    .command("detect <url>")
    .description("检测 URL 对应的课程平台")
    .action((url: string) => {
      const result = detector.detect(url);
      out(result ?? { detected: false });
    });

  // ══════════════════════════════════════════
  // 页面 (page)
  // ══════════════════════════════════════════

  const page = program.command("page").description("页面操作");

  page
    .command("list")
    .description("列出所有页面")
    .action(async () => {
      if (!(await ensureConnected())) return;
      out(await api("/agent/pages"));
    });

  page
    .command("open <url>")
    .description("导航到 URL")
    .action(async (url: string) => {
      if (!(await ensureConnected())) return;
      out(await post("/agent/navigate", { url }));
    });

  page
    .command("new [url]")
    .description("新建页面")
    .action(async (url?: string) => {
      if (!(await ensureConnected())) return;
      out(await post("/agent/newPage", { url }));
    });

  page
    .command("screenshot [file]")
    .description("截图 (base64 或保存到文件)")
    .option("--full", "完整页面")
    .action(async (file?: string, opts?: any) => {
      if (!(await ensureConnected())) return;
      const data = await api(`/agent/screenshot?fullPage=${opts?.full || false}`);
      if (file) {
        const { writeFileSync } = await import("node:fs");
        writeFileSync(file, Buffer.from(data.screenshot, "base64"));
        log(`已保存: ${file}`);
        out({ saved: file, length: data.screenshot.length });
      } else {
        out(data);
      }
    });

  page
    .command("snapshot")
    .description("DOM 快照")
    .action(async () => {
      if (!(await ensureConnected())) return;
      out(await api("/agent/snapshot"));
    });

  page
    .command("eval <expression>")
    .description("执行 JavaScript")
    .action(async (expr: string) => {
      if (!(await ensureConnected())) return;
      const r = await post("/agent/eval", { expression: expr });
      out(r.result ?? r);
    });

  page
    .command("content")
    .description("获取页面 HTML")
    .action(async () => {
      if (!(await ensureConnected())) return;
      const r = await api("/agent/content");
      console.log(r.content);
    });

  page
    .command("url")
    .description("当前 URL")
    .action(async () => {
      if (!(await ensureConnected())) return;
      out(await api("/agent/url"));
    });

  // ══════════════════════════════════════════
  // 元素操作 (act)
  // ══════════════════════════════════════════

  const act = program.command("act").description("元素操作");

  act.command("click <selector>").description("点击").action(async (sel: string) => {
    if (!(await ensureConnected())) return;
    out(await post("/agent/click", { selector: sel }));
  });

  act.command("fill <selector> <value>").description("填写").action(async (sel: string, val: string) => {
    if (!(await ensureConnected())) return;
    out(await post("/agent/fill", { selector: sel, value: val }));
  });

  act.command("press <key>").description("按键").action(async (key: string) => {
    if (!(await ensureConnected())) return;
    out(await post("/agent/press", { key }));
  });

  act.command("hover <selector>").description("悬停").action(async (sel: string) => {
    if (!(await ensureConnected())) return;
    out(await post("/agent/hover", { selector: sel }));
  });

  act.command("wait <selector>").description("等待元素出现").option("-t, --timeout <ms>", "超时", "30000").action(async (sel: string, opts: any) => {
    if (!(await ensureConnected())) return;
    out(await post("/agent/waitFor", { selector: sel, timeout: Number(opts.timeout) }));
  });

  // ══════════════════════════════════════════
  // iframe
  // ══════════════════════════════════════════

  const iframe = program.command("iframe").description("iframe 操作（课程内容在 iframe 内）");

  iframe.command("list").description("列出 iframe").action(async () => {
    if (!(await ensureConnected())) return;
    out(await api("/agent/iframes"));
  });

  iframe.command("eval <index> <expression>").description("iframe 内执行 JS").action(async (idx: string, expr: string) => {
    if (!(await ensureConnected())) return;
    const r = await post("/agent/iframe-eval", { iframeIndex: Number(idx), expression: expr });
    out(r.result ?? r);
  });

  iframe.command("media <index>").description("iframe 内媒体检测").action(async (idx: string) => {
    if (!(await ensureConnected())) return;
    out(await post("/agent/iframe-media", { iframeIndex: Number(idx) }));
  });

  iframe.command("questions <index>").description("提取题目").action(async (idx: string) => {
    if (!(await ensureConnected())) return;
    out(await post("/agent/iframe-questions", { iframeIndex: Number(idx) }));
  });

  iframe.command("answer <index> <question> <answer>").description("选择答案").option("-m, --mode <mode>", "匹配模式: similar|exact", "similar").action(async (idx: string, q: string, a: string, opts: any) => {
    if (!(await ensureConnected())) return;
    out(await post("/agent/iframe-answer", { iframeIndex: Number(idx), questionText: q, answerText: a, matchMode: opts.mode }));
  });

  iframe.command("submit <index>").description("提交答案").action(async (idx: string) => {
    if (!(await ensureConnected())) return;
    out(await post("/agent/iframe-submit", { iframeIndex: Number(idx) }));
  });

  iframe.command("batch <index>").description("批量答题").requiredOption("--answers <json>", "答案 JSON: [{questionText,answerText}]").option("--submit", "答完自动提交").action(async (idx: string, opts: any) => {
    if (!(await ensureConnected())) return;
    const answers = JSON.parse(opts.answers);
    out(await post("/agent/iframe-batch-answer", { iframeIndex: Number(idx), answers, autoSubmit: opts.submit }));
  });

  // ══════════════════════════════════════════
  // 视频 (video)
  // ══════════════════════════════════════════

  const video = program.command("video").description("视频控制");

  video.command("status [index]").description("视频状态 (-1=搜索全部)").option("-p, --page <pageIndex>", "页面索引", "0").action(async (idx?: string, opts?: any) => {
    if (!(await ensureConnected())) return;
    out(await post("/agent/video/status", { iframeIndex: idx ? Number(idx) : -1, pageIndex: Number(opts?.page || 0) }));
  });

  video.command("play [index]").description("播放").option("-p, --page <pageIndex>", "页面索引", "0").action(async (idx?: string, opts?: any) => {
    if (!(await ensureConnected())) return;
    out(await post("/agent/video/play", { iframeIndex: idx ? Number(idx) : -1, pageIndex: Number(opts?.page || 0) }));
  });

  video.command("pause [index]").description("暂停").option("-p, --page <pageIndex>", "页面索引", "0").action(async (idx?: string, opts?: any) => {
    if (!(await ensureConnected())) return;
    out(await post("/agent/video/pause", { iframeIndex: idx ? Number(idx) : -1, pageIndex: Number(opts?.page || 0) }));
  });

  video.command("rate [index] <rate>").description("设置倍速").option("-p, --page <pageIndex>", "页面索引", "0").action(async (idxOrRate: string, rate?: string, opts?: any) => {
    if (!(await ensureConnected())) return;
    const r = rate ? Number(rate) : Number(idxOrRate);
    const i = rate ? Number(idxOrRate) : -1;
    out(await post("/agent/video/setRate", { iframeIndex: i, rate: r, pageIndex: Number(opts?.page || 0) }));
  });

  video.command("autoplay [index]").description("自动播放").option("-p, --page <pageIndex>", "页面索引", "0").option("-r, --rate <rate>", "倍速", "1").option("-v, --volume <vol>", "音量", "1").action(async (idx?: string, opts?: any) => {
    if (!(await ensureConnected())) return;
    out(await post("/agent/video/autoPlay", { iframeIndex: idx ? Number(idx) : -1, rate: Number(opts?.rate || 1), volume: Number(opts?.volume || 1), pageIndex: Number(opts?.page || 0) }));
  });

  // ══════════════════════════════════════════
  // 课程 (course)
  // ══════════════════════════════════════════

  const course = program.command("course").description("课程操作");

  course.command("list").description("获取课程列表").action(async () => {
    if (!(await ensureConnected())) return;
    const r = await post("/agent/cx/courses", {});
    out(r.courses ?? r);
  });

  course.command("chapters <courseId> <clazzId>").description("获取章节列表").action(async (cid: string, clid: string) => {
    if (!(await ensureConnected())) return;
    out(await post("/agent/cx/chapters", { courseId: cid, clazzId: clid }));
  });

  course.command("open <courseId> <clazzId> <chapterId>").description("进入章节学习").action(async (cid: string, clid: string, chid: string) => {
    if (!(await ensureConnected())) return;
    out(await post("/agent/cx/study", { courseId: cid, clazzId: clid, chapterId: chid }));
  });

  course.command("remaining <courseId> <clazzId>").description("获取未完成章节列表").action(async (cid: string, clid: string) => {
    if (!(await ensureConnected())) return;
    out(await post("/agent/cx/chapters", { courseId: cid, clazzId: clid }));
  });

  // ══════════════════════════════════════════
  // 智慧树 (zhs)
  // ══════════════════════════════════════════

  const zhs = program.command("zhs").description("智慧树课程操作");

  zhs.command("courses").description("获取课程列表").action(async () => {
    if (!(await ensureConnected())) return;
    out(await post("/agent/zhs/courses", {}));
  });

  zhs.command("video").description("视频状态").action(async () => {
    if (!(await ensureConnected())) return;
    out(await api("/agent/zhs/video"));
  });

  zhs.command("login-status").description("登录状态").action(async () => {
    if (!(await ensureConnected())) return;
    out(await api("/agent/zhs/login-status"));
  });

  zhs.command("login-phone").description("手机登录").requiredOption("--phone <phone>").requiredOption("--password <password>").action(async (opts: any) => {
    if (!(await ensureConnected())) return;
    out(await post("/agent/zhs/login-phone", { phone: opts.phone, password: opts.password }));
  });

  zhs.command("login-school").description("学校登录").requiredOption("--school <name>").requiredOption("--id <id>").requiredOption("--password <password>").action(async (opts: any) => {
    if (!(await ensureConnected())) return;
    out(await post("/agent/zhs/login-school", { schoolname: opts.school, id: opts.id, password: opts.password }));
  });

  // ══════════════════════════════════════════
  // 状态
  // ══════════════════════════════════════════

  program.command("status").description("当前学习状态").action(async () => {
    if (!(await ensureConnected())) return;
    out(await api("/agent/auto-study/status"));
  });

  // ══════════════════════════════════════════
  // 登录 & OCR
  // ══════════════════════════════════════════

  program.command("login").description("登录操作").requiredOption("--phone <phone>").requiredOption("--password <password>").action(async (opts: any) => {
    if (!(await ensureConnected())) return;
    out(await post("/agent/login/cx-phone", { phone: opts.phone, password: opts.password }));
  });

  program.command("ocr <image>").description("OCR 验证码识别").action(async (image: string) => {
    if (!(await ensureConnected())) return;
    const { readFileSync, existsSync } = await import("node:fs");
    let b64 = image;
    if (existsSync(image)) b64 = readFileSync(image).toString("base64");
    out(await post("/agent/ocr", { image: b64 }));
  });

  // ══════════════════════════════════════════
  // 配置 (config)
  // ══════════════════════════════════════════

  const config = program.command("config").description("ocsjs 配置管理");

  config.command("get").description("读取配置").action(async () => {
    if (!(await ensureConnected())) return;
    out(await api("/agent/config"));
  });

  config.command("set <key> <value>").description("修改配置项").action(async (key: string, value: string) => {
    if (!(await ensureConnected())) return;
    let parsed: any = value;
    try { parsed = JSON.parse(value); } catch {}
    out(await post("/agent/config/set", { key, value: parsed }));
  });

  config.command("cache").description("查看答案缓存").action(async () => {
    if (!(await ensureConnected())) return;
    out(await api("/agent/config/cache"));
  });

  config.command("clear-cache").description("清空答案缓存").action(async () => {
    if (!(await ensureConnected())) return;
    const r = await fetch(`${agentBaseUrl}/agent/config/cache`, { method: "DELETE" }).then((r) => r.json());
    out(r);
  });

  // ══════════════════════════════════════════
  // 原始请求 (request)
  // ══════════════════════════════════════════

  program
    .command("request <method> <path>")
    .description("原始 Agent API 请求 (GET/POST/DELETE)")
    .option("--body <json>", "请求体 JSON")
    .action(async (method: string, path: string, opts: any) => {
      if (!(await ensureConnected())) return;
      const options: RequestInit = { method: method.toUpperCase() };
      if (opts.body) {
        options.headers = { "Content-Type": "application/json" };
        options.body = opts.body;
      }
      out(await api(path.startsWith("/") ? path : `/${path}`, options));
    });

  // ── 答案服务 ──
  registerAnswerCommands(program, answerService, ensureConnected, out);

  return program;
}

const program = createCLI();
program.parse(process.argv);
