import { chromium, type BrowserContext, type Page } from "playwright-core";
import { randomUUID } from "node:crypto";
import { existsSync } from "node:fs";
import { join } from "node:path";
import { homedir } from "node:os";
import type { BrowserLaunchOptions, PageInfo, ScreenshotOptions, ActionResult } from "../types.js";

const OCS_USER_DATA = join(homedir(), ".ocs-cli", "profiles");

interface ManagedBrowser {
  id: string;
  /** ocs-desktop Agent 服务地址（如果通过 Agent 连接） */
  agentUrl?: string;
  context?: BrowserContext;
  pages?: Map<number, Page>;
  createdAt: number;
}

export class BrowserController {
  private browsers: Map<string, ManagedBrowser> = new Map();
  private defaultBrowserId: string | null = null;

  // ── Agent HTTP 请求辅助 ──
  private async agentFetch(browser: ManagedBrowser, path: string, options?: RequestInit): Promise<any> {
    if (!browser.agentUrl) throw new Error("非 Agent 模式");
    const resp = await fetch(`${browser.agentUrl}${path}`, options);
    return resp.json();
  }

  // ── 独立模式：启动浏览器 ──
  async launch(options: BrowserLaunchOptions = {}): Promise<{ browserId: string; pages: PageInfo[] }> {
    const executablePath = options.executablePath ?? this.findChrome();
    if (!executablePath) {
      throw new Error("Chrome/Edge not found. Pass --executable-path or install Chrome/Edge.");
    }

    const id = randomUUID().slice(0, 8);
    const userDataDir = options.userDataDir ?? join(OCS_USER_DATA, id);

    const context = await chromium.launchPersistentContext(userDataDir, {
      headless: options.headless ?? false,
      executablePath,
      ignoreHTTPSErrors: true,
      acceptDownloads: true,
      viewport: options.viewport ?? null,
      ignoreDefaultArgs: ["--disable-extensions", "--enable-automation"],
      args: [
        "--no-first-run",
        "--no-default-browser-check",
        "--disable-blink-features=AutomationControlled",
        ...(options.proxy ? [`--proxy-server=${options.proxy}`] : []),
        ...(options.args ?? []),
      ],
    });

    await context.addInitScript(() => {
      Object.defineProperty(navigator, "webdriver", { get: () => false });
    });

    const pages = new Map<number, Page>();
    context.pages().forEach((p, i) => pages.set(i, p));
    context.on("page", (page) => { pages.set(pages.size, page); });

    const browser: ManagedBrowser = { id, context, pages, createdAt: Date.now() };
    this.browsers.set(id, browser);
    if (!this.defaultBrowserId) this.defaultBrowserId = id;

    return { browserId: id, pages: await this.listPages(id) };
  }

  // ── Agent 模式：连接 ocs-desktop ──
  async connectToDesktop(agentPort?: number): Promise<{ browserId: string; pages: PageInfo[] }> {
    let agentUrl: string;

    if (agentPort) {
      agentUrl = `http://127.0.0.1:${agentPort}`;
    } else {
      // 自动发现：先查 ocs-desktop 主服务（15319）获取 Agent 端口
      try {
        const resp = await fetch("http://127.0.0.1:15319/agent");
        if (resp.ok) {
          const info = await resp.json() as any;
          agentUrl = info.agentUrl || `http://127.0.0.1:${info.agentPort || 17900}`;
        } else {
          agentUrl = "http://127.0.0.1:17900";
        }
      } catch {
        agentUrl = "http://127.0.0.1:17900";
      }
    }

    // 验证 Agent 服务是否可达
    const health = await this.agentFetch({ agentUrl } as ManagedBrowser, "/agent/health").catch(() => null);
    if (!health || health.status !== "ok") {
      throw new Error(
        `无法连接 ocs-desktop Agent 服务 (${agentUrl})。\n` +
        `请确认 ocs-desktop 已启动且浏览器已打开。\n` +
        `提示: 在 ocs-desktop 中启动浏览器后，Agent 服务自动可用。`
      );
    }

    const id = randomUUID().slice(0, 8);
    const browser: ManagedBrowser = { id, agentUrl, createdAt: Date.now() };
    this.browsers.set(id, browser);
    if (!this.defaultBrowserId) this.defaultBrowserId = id;

    return { browserId: id, pages: await this.listPages(id) };
  }

  async close(browserId?: string): Promise<void> {
    const id = browserId ?? this.defaultBrowserId;
    if (!id) throw new Error("No browser running");
    const browser = this.browsers.get(id);
    if (!browser) throw new Error(`Browser ${id} not found`);
    if (browser.context) await browser.context.close();
    this.browsers.delete(id);
    if (this.defaultBrowserId === id) {
      this.defaultBrowserId = this.browsers.size > 0 ? this.browsers.keys().next().value! : null;
    }
  }

  async closeAll(): Promise<void> {
    for (const [id] of this.browsers) {
      await this.close(id);
    }
  }

  listBrowsers(): { id: string; pageCount: number; createdAt: number }[] {
    return Array.from(this.browsers.values()).map((b) => ({
      id: b.id,
      pageCount: b.pages?.size ?? 0,
      createdAt: b.createdAt,
    }));
  }

  private resolveBrowser(browserId?: string): ManagedBrowser {
    const id = browserId ?? this.defaultBrowserId;
    if (!id) throw new Error("No browser running. Use 'ocs launch' or 'ocs connect' first.");
    const browser = this.browsers.get(id);
    if (!browser) throw new Error(`Browser ${id} not found`);
    return browser;
  }

  // ── 通用操作（自动分发到 Playwright 或 Agent） ──

  async listPages(browserId?: string): Promise<PageInfo[]> {
    const browser = this.resolveBrowser(browserId);
    if (browser.agentUrl) {
      return await this.agentFetch(browser, "/agent/pages");
    }
    const pages: PageInfo[] = [];
    for (const [idx, page] of browser.pages!) {
      pages.push({ url: page.url(), title: await page.title().catch(() => ""), index: idx });
    }
    return pages;
  }

  async navigate(url: string, browserId?: string, pageIndex?: number): Promise<ActionResult> {
    const browser = this.resolveBrowser(browserId);
    if (browser.agentUrl) {
      return await this.agentFetch(browser, "/agent/navigate", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ url, pageIndex }),
      });
    }
    const page = browser.pages!.get(pageIndex ?? 0)!;
    await page.goto(url, { waitUntil: "domcontentloaded", timeout: 30000 });
    return { success: true, message: `Navigated to ${url}` };
  }

  async screenshot(options: ScreenshotOptions = {}, browserId?: string, pageIndex?: number): Promise<string> {
    const browser = this.resolveBrowser(browserId);
    if (browser.agentUrl) {
      const data = await this.agentFetch(browser, `/agent/screenshot?pageIndex=${pageIndex ?? 0}&fullPage=${options.fullPage ?? false}`);
      return data.screenshot;
    }
    const page = browser.pages!.get(pageIndex ?? 0)!;
    const buf = await page.screenshot({ fullPage: options.fullPage ?? false, type: options.type ?? "png" });
    return buf.toString("base64");
  }

  async getSnapshot(browserId?: string, pageIndex?: number): Promise<string> {
    const browser = this.resolveBrowser(browserId);
    if (browser.agentUrl) {
      const data = await this.agentFetch(browser, `/agent/snapshot?pageIndex=${pageIndex ?? 0}`);
      return data.snapshot;
    }
    const page = browser.pages!.get(pageIndex ?? 0)!;
    return await page.evaluate(new Function(`
      function snap(el, depth) {
        if (!el || depth > 8) return null;
        var role = el.getAttribute("role") || el.tagName.toLowerCase();
        var name = (el.innerText || "").slice(0, 100) || el.getAttribute("aria-label") || "";
        var children = [];
        for (var i = 0; i < el.children.length; i++) {
          var s = snap(el.children[i], depth + 1);
          if (s) children.push(s);
        }
        var r = { role: role, name: name.slice(0, 200) };
        if (children.length) r.children = children;
        return r;
      }
      return JSON.stringify(snap(document.body, 0));
    `) as () => string);
  }

  async getPageState(browserId?: string, pageIndex?: number) {
    const browser = this.resolveBrowser(browserId);
    if (browser.agentUrl) {
      const pages = await this.agentFetch(browser, "/agent/pages");
      const p = pages.find((x: PageInfo) => x.index === (pageIndex ?? 0));
      return { url: p?.url ?? "", title: p?.title ?? "" };
    }
    const page = browser.pages!.get(pageIndex ?? 0)!;
    return { url: page.url(), title: await page.title().catch(() => "") };
  }

  async click(selector: string, browserId?: string, pageIndex?: number): Promise<ActionResult> {
    const browser = this.resolveBrowser(browserId);
    if (browser.agentUrl) {
      return await this.agentFetch(browser, "/agent/click", {
        method: "POST", headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ selector, pageIndex }),
      });
    }
    await browser.pages!.get(pageIndex ?? 0)!.click(selector, { timeout: 10000 });
    return { success: true, message: `Clicked ${selector}` };
  }

  async fill(selector: string, value: string, browserId?: string, pageIndex?: number): Promise<ActionResult> {
    const browser = this.resolveBrowser(browserId);
    if (browser.agentUrl) {
      return await this.agentFetch(browser, "/agent/fill", {
        method: "POST", headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ selector, value, pageIndex }),
      });
    }
    await browser.pages!.get(pageIndex ?? 0)!.fill(selector, value, { timeout: 10000 });
    return { success: true, message: `Filled ${selector}` };
  }

  async select(selector: string, value: string, browserId?: string, pageIndex?: number): Promise<ActionResult> {
    const browser = this.resolveBrowser(browserId);
    if (browser.agentUrl) {
      return await this.agentFetch(browser, "/agent/select", {
        method: "POST", headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ selector, value, pageIndex }),
      });
    }
    await browser.pages!.get(pageIndex ?? 0)!.selectOption(selector, value, { timeout: 10000 });
    return { success: true, message: `Selected ${value}` };
  }

  async press(key: string, browserId?: string, pageIndex?: number): Promise<ActionResult> {
    const browser = this.resolveBrowser(browserId);
    if (browser.agentUrl) {
      return await this.agentFetch(browser, "/agent/press", {
        method: "POST", headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ key, pageIndex }),
      });
    }
    await browser.pages!.get(pageIndex ?? 0)!.keyboard.press(key);
    return { success: true, message: `Pressed ${key}` };
  }

  async type(selector: string, text: string, browserId?: string, pageIndex?: number, delay = 50): Promise<ActionResult> {
    const browser = this.resolveBrowser(browserId);
    if (browser.agentUrl) {
      // Agent 模式下用 fill 代替 type（更可靠）
      return await this.fill(selector, text, browserId, pageIndex);
    }
    await browser.pages!.get(pageIndex ?? 0)!.type(selector, text, { delay });
    return { success: true, message: `Typed into ${selector}` };
  }

  async hover(selector: string, browserId?: string, pageIndex?: number): Promise<ActionResult> {
    const browser = this.resolveBrowser(browserId);
    if (browser.agentUrl) {
      return await this.agentFetch(browser, "/agent/hover", {
        method: "POST", headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ selector, pageIndex }),
      });
    }
    await browser.pages!.get(pageIndex ?? 0)!.hover(selector, { timeout: 10000 });
    return { success: true, message: `Hovered ${selector}` };
  }

  async evaluate(expression: string, browserId?: string, pageIndex?: number): Promise<unknown> {
    const browser = this.resolveBrowser(browserId);
    if (browser.agentUrl) {
      const data = await this.agentFetch(browser, "/agent/eval", {
        method: "POST", headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ expression, pageIndex }),
      });
      return data.result;
    }
    return await browser.pages!.get(pageIndex ?? 0)!.evaluate(expression);
  }

  async waitForSelector(selector: string, timeout = 30000, browserId?: string, pageIndex?: number): Promise<ActionResult> {
    const browser = this.resolveBrowser(browserId);
    if (browser.agentUrl) {
      return await this.agentFetch(browser, "/agent/waitFor", {
        method: "POST", headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ selector, timeout, pageIndex }),
      });
    }
    await browser.pages!.get(pageIndex ?? 0)!.waitForSelector(selector, { timeout });
    return { success: true, message: `Found ${selector}` };
  }

  async getContent(browserId?: string, pageIndex?: number): Promise<string> {
    const browser = this.resolveBrowser(browserId);
    if (browser.agentUrl) {
      const data = await this.agentFetch(browser, `/agent/content?pageIndex=${pageIndex ?? 0}`);
      return data.content;
    }
    return await browser.pages!.get(pageIndex ?? 0)!.content();
  }

  async getUrl(browserId?: string, pageIndex?: number): Promise<string> {
    const browser = this.resolveBrowser(browserId);
    if (browser.agentUrl) {
      const data = await this.agentFetch(browser, `/agent/url?pageIndex=${pageIndex ?? 0}`);
      return data.url;
    }
    return browser.pages!.get(pageIndex ?? 0)!.url();
  }

  async newPage(url?: string, browserId?: string): Promise<{ index: number; url: string }> {
    const browser = this.resolveBrowser(browserId);
    if (browser.agentUrl) {
      return await this.agentFetch(browser, "/agent/newPage", {
        method: "POST", headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ url }),
      });
    }
    const page = await browser.context!.newPage();
    const idx = Array.from(browser.pages!.keys()).reduce((max, k) => Math.max(max, k), -1) + 1;
    browser.pages!.set(idx, page);
    if (url) await page.goto(url, { waitUntil: "domcontentloaded", timeout: 30000 });
    return { index: idx, url: page.url() };
  }

  async closePage(browserId?: string, pageIndex?: number): Promise<ActionResult> {
    const browser = this.resolveBrowser(browserId);
    if (browser.agentUrl) {
      return { success: true, message: "Agent 模式下不支持关闭页面" };
    }
    const page = browser.pages!.get(pageIndex ?? 0)!;
    await page.close();
    browser.pages!.delete(pageIndex ?? 0);
    return { success: true, message: "Page closed" };
  }

  async evaluateWithArgs(expression: string, args: unknown[], browserId?: string, pageIndex?: number): Promise<unknown> {
    const browser = this.resolveBrowser(browserId);
    if (browser.agentUrl) {
      const data = await this.agentFetch(browser, "/agent/eval", {
        method: "POST", headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ expression, pageIndex }),
      });
      return data.result;
    }
    return await browser.pages!.get(pageIndex ?? 0)!.evaluate(expression, args);
  }

  getDefaultBrowserId(): string | null {
    return this.defaultBrowserId;
  }

  getBrowser(browserId?: string): ManagedBrowser | undefined {
    return this.browsers.get(browserId ?? this.defaultBrowserId ?? "");
  }

  // ── iframe 操作 ──

  async listIframes(browserId?: string, pageIndex?: number): Promise<any[]> {
    const browser = this.resolveBrowser(browserId);
    if (browser.agentUrl) {
      return await this.agentFetch(browser, `/agent/iframes?pageIndex=${pageIndex ?? 0}`);
    }
    const page = browser.pages!.get(pageIndex ?? 0)!;
    // eslint-disable-next-line @typescript-eslint/no-implied-eval
    return await page.evaluate(new Function(
      'var r=[];var f=document.querySelectorAll("iframe");' +
      'for(var i=0;i<f.length;i++){var s="";try{s=f[i].src||""}catch(e){}' +
      'r.push({index:i,src:s.slice(0,200),id:f[i].id||"",name:f[i].name||"",accessible:false});' +
      'try{f[i].contentDocument;r[r.length-1].accessible=true}catch(e){}}return r;'
    ) as () => any[]);
  }

  async iframeEval(expression: string, iframeIndex = 0, browserId?: string, pageIndex?: number): Promise<unknown> {
    const browser = this.resolveBrowser(browserId);
    if (browser.agentUrl) {
      const data = await this.agentFetch(browser, "/agent/iframe-eval", {
        method: "POST", headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ expression, iframeIndex, pageIndex }),
      });
      return data.result;
    }
    const page = browser.pages!.get(pageIndex ?? 0)!;
    // eslint-disable-next-line @typescript-eslint/no-implied-eval
    return await page.evaluate(
      new Function(
        'args',
        'var iframe=document.querySelectorAll("iframe")[args.iframeIndex];' +
        'if(!iframe)throw new Error("iframe 不存在");' +
        'var doc=iframe.contentDocument;if(!doc)throw new Error("跨域");' +
        'var fn=new Function("document","window","return("+args.expression+")");' +
        'return fn(doc,iframe.contentWindow);'
      ) as (args: { iframeIndex: number; expression: string }) => unknown,
      { iframeIndex, expression }
    );
  }

  async iframeMedia(iframeIndex = 0, browserId?: string, pageIndex?: number): Promise<any[]> {
    const browser = this.resolveBrowser(browserId);
    if (browser.agentUrl) {
      return await this.agentFetch(browser, "/agent/iframe-media", {
        method: "POST", headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ iframeIndex, pageIndex }),
      });
    }
    return [];
  }

  async iframeMediaControl(action: string, value?: number, iframeIndex = 0, browserId?: string, pageIndex?: number): Promise<any> {
    const browser = this.resolveBrowser(browserId);
    if (browser.agentUrl) {
      return await this.agentFetch(browser, "/agent/iframe-media-control", {
        method: "POST", headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ action, value, iframeIndex, pageIndex }),
      });
    }
    return { success: false, message: "仅支持 Agent 模式" };
  }

  async iframeQuestions(iframeIndex = 0, browserId?: string, pageIndex?: number): Promise<any[]> {
    const browser = this.resolveBrowser(browserId);
    if (browser.agentUrl) {
      return await this.agentFetch(browser, "/agent/iframe-questions", {
        method: "POST", headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ iframeIndex, pageIndex }),
      });
    }
    return [];
  }

  async iframeAnswer(questionText: string, answerText: string, matchMode = "similar", iframeIndex = 0, browserId?: string, pageIndex?: number): Promise<any> {
    const browser = this.resolveBrowser(browserId);
    if (browser.agentUrl) {
      return await this.agentFetch(browser, "/agent/iframe-answer", {
        method: "POST", headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ questionText, answerText, matchMode, iframeIndex, pageIndex }),
      });
    }
    return { success: false, message: "仅支持 Agent 模式" };
  }

  private findChrome(): string | null {
    const candidates = [
      "C:\\Program Files\\Google\\Chrome\\Application\\chrome.exe",
      "C:\\Program Files (x86)\\Google\\Chrome\\Application\\chrome.exe",
      process.env.LOCALAPPDATA + "\\Google\\Chrome\\Application\\chrome.exe",
      "C:\\Program Files\\Microsoft\\Edge\\Application\\msedge.exe",
      "/Applications/Google Chrome.app/Contents/MacOS/Google Chrome",
      "/usr/bin/google-chrome",
      "/usr/bin/google-chrome-stable",
      "/usr/bin/chromium-browser",
      "/usr/bin/microsoft-edge",
    ];
    for (const p of candidates) {
      if (p && existsSync(p)) return p;
    }
    return null;
  }
}
