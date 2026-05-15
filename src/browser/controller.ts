import { chromium, type BrowserContext, type Page } from "playwright-core";
import { randomUUID } from "node:crypto";
import { existsSync } from "node:fs";
import { join } from "node:path";
import { homedir } from "node:os";
import type { BrowserLaunchOptions, PageInfo, SnapshotNode, ScreenshotOptions, ActionResult } from "../types.js";

const OCS_USER_DATA = join(homedir(), ".ocs-cli", "profiles");

interface ManagedBrowser {
  id: string;
  context: BrowserContext;
  pages: Map<number, Page>;
  createdAt: number;
}

export class BrowserController {
  private browsers: Map<string, ManagedBrowser> = new Map();
  private defaultBrowserId: string | null = null;

  async launch(options: BrowserLaunchOptions = {}): Promise<{ browserId: string; pages: PageInfo[] }> {
    const executablePath = options.executablePath ?? this.findChrome();
    if (!executablePath) {
      throw new Error(
        "Chrome/Edge not found. Pass --executable-path or install Chrome/Edge."
      );
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

    // Anti-detection
    await context.addInitScript(() => {
      Object.defineProperty(navigator, "webdriver", { get: () => false });
    });

    const pages = new Map<number, Page>();
    context.pages().forEach((p, i) => pages.set(i, p));

    // Track new pages
    context.on("page", (page) => {
      const idx = pages.size;
      pages.set(idx, page);
    });

    const browser: ManagedBrowser = { id, context, pages, createdAt: Date.now() };
    this.browsers.set(id, browser);
    if (!this.defaultBrowserId) this.defaultBrowserId = id;

    const pageInfos = await this.listPages(id);
    return { browserId: id, pages: pageInfos };
  }

  async close(browserId?: string): Promise<void> {
    const id = browserId ?? this.defaultBrowserId;
    if (!id) throw new Error("No browser running");
    const browser = this.browsers.get(id);
    if (!browser) throw new Error(`Browser ${id} not found`);
    await browser.context.close();
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
      pageCount: b.pages.size,
      createdAt: b.createdAt,
    }));
  }

  private resolveBrowser(browserId?: string): ManagedBrowser {
    const id = browserId ?? this.defaultBrowserId;
    if (!id) throw new Error("No browser running. Use 'ocs launch' first.");
    const browser = this.browsers.get(id);
    if (!browser) throw new Error(`Browser ${id} not found`);
    return browser;
  }

  private resolvePage(browser: ManagedBrowser, pageIndex?: number): Page {
    const idx = pageIndex ?? 0;
    const page = browser.pages.get(idx);
    if (!page) throw new Error(`Page ${idx} not found`);
    return page;
  }

  async listPages(browserId?: string): Promise<PageInfo[]> {
    const browser = this.resolveBrowser(browserId);
    const pages: PageInfo[] = [];
    for (const [idx, page] of browser.pages) {
      pages.push({
        url: page.url(),
        title: await page.title().catch(() => ""),
        index: idx,
      });
    }
    return pages;
  }

  async navigate(url: string, browserId?: string, pageIndex?: number): Promise<ActionResult> {
    const browser = this.resolveBrowser(browserId);
    const page = this.resolvePage(browser, pageIndex);
    await page.goto(url, { waitUntil: "domcontentloaded", timeout: 30000 });
    return { success: true, message: `Navigated to ${url}` };
  }

  async newPage(url?: string, browserId?: string): Promise<{ index: number; url: string }> {
    const browser = this.resolveBrowser(browserId);
    const page = await browser.context.newPage();
    const idx = Array.from(browser.pages.keys()).reduce((max, k) => Math.max(max, k), -1) + 1;
    browser.pages.set(idx, page);
    if (url) await page.goto(url, { waitUntil: "domcontentloaded", timeout: 30000 });
    return { index: idx, url: page.url() };
  }

  async closePage(browserId?: string, pageIndex?: number): Promise<ActionResult> {
    const browser = this.resolveBrowser(browserId);
    const page = this.resolvePage(browser, pageIndex);
    await page.close();
    browser.pages.delete(pageIndex ?? 0);
    return { success: true, message: "Page closed" };
  }

  async screenshot(options: ScreenshotOptions = {}, browserId?: string, pageIndex?: number): Promise<string> {
    const browser = this.resolveBrowser(browserId);
    const page = this.resolvePage(browser, pageIndex);
    const buf = await page.screenshot({
      fullPage: options.fullPage ?? false,
      type: options.type ?? "png",
      ...(options.quality ? { quality: options.quality } : {}),
    });
    return buf.toString("base64");
  }

  async getSnapshot(browserId?: string, pageIndex?: number): Promise<string> {
    const browser = this.resolveBrowser(browserId);
    const page = this.resolvePage(browser, pageIndex);
    // eslint-disable-next-line @typescript-eslint/no-implied-eval
    return await page.evaluate(new Function(`
      function snap(el, depth) {
        if (!el || depth > 8) return null;
        var role = el.getAttribute("role") || el.tagName.toLowerCase();
        var name = (el.innerText || "").slice(0, 100) || el.getAttribute("aria-label") || el.getAttribute("title") || "";
        var children = [];
        for (var i = 0; i < el.children.length; i++) {
          var s = snap(el.children[i], depth + 1);
          if (s) children.push(s);
        }
        var result = { role: role, name: name.slice(0, 200) };
        if (children.length) result.children = children;
        return result;
      }
      return JSON.stringify(snap(document.body, 0));
    `) as () => string);
  }

  async getPageState(browserId?: string, pageIndex?: number) {
    const browser = this.resolveBrowser(browserId);
    const page = this.resolvePage(browser, pageIndex);
    return {
      url: page.url(),
      title: await page.title().catch(() => ""),
    };
  }

  // --- Agent action methods ---

  async click(selector: string, browserId?: string, pageIndex?: number): Promise<ActionResult> {
    const browser = this.resolveBrowser(browserId);
    const page = this.resolvePage(browser, pageIndex);
    await page.click(selector, { timeout: 10000 });
    return { success: true, message: `Clicked ${selector}` };
  }

  async fill(selector: string, value: string, browserId?: string, pageIndex?: number): Promise<ActionResult> {
    const browser = this.resolveBrowser(browserId);
    const page = this.resolvePage(browser, pageIndex);
    await page.fill(selector, value, { timeout: 10000 });
    return { success: true, message: `Filled ${selector}` };
  }

  async select(selector: string, value: string, browserId?: string, pageIndex?: number): Promise<ActionResult> {
    const browser = this.resolveBrowser(browserId);
    const page = this.resolvePage(browser, pageIndex);
    await page.selectOption(selector, value, { timeout: 10000 });
    return { success: true, message: `Selected ${value} in ${selector}` };
  }

  async press(key: string, browserId?: string, pageIndex?: number): Promise<ActionResult> {
    const browser = this.resolveBrowser(browserId);
    const page = this.resolvePage(browser, pageIndex);
    await page.keyboard.press(key);
    return { success: true, message: `Pressed ${key}` };
  }

  async type(selector: string, text: string, browserId?: string, pageIndex?: number, delay = 50): Promise<ActionResult> {
    const browser = this.resolveBrowser(browserId);
    const page = this.resolvePage(browser, pageIndex);
    await page.type(selector, text, { delay });
    return { success: true, message: `Typed into ${selector}` };
  }

  async hover(selector: string, browserId?: string, pageIndex?: number): Promise<ActionResult> {
    const browser = this.resolveBrowser(browserId);
    const page = this.resolvePage(browser, pageIndex);
    await page.hover(selector, { timeout: 10000 });
    return { success: true, message: `Hovered ${selector}` };
  }

  async evaluate(expression: string, browserId?: string, pageIndex?: number): Promise<unknown> {
    const browser = this.resolveBrowser(browserId);
    const page = this.resolvePage(browser, pageIndex);
    return await page.evaluate(expression);
  }

  async evaluateWithArgs(expression: string, args: unknown[], browserId?: string, pageIndex?: number): Promise<unknown> {
    const browser = this.resolveBrowser(browserId);
    const page = this.resolvePage(browser, pageIndex);
    return await page.evaluate(expression, args);
  }

  async waitForSelector(selector: string, timeout = 30000, browserId?: string, pageIndex?: number): Promise<ActionResult> {
    const browser = this.resolveBrowser(browserId);
    const page = this.resolvePage(browser, pageIndex);
    await page.waitForSelector(selector, { timeout });
    return { success: true, message: `Found ${selector}` };
  }

  async getContent(browserId?: string, pageIndex?: number): Promise<string> {
    const browser = this.resolveBrowser(browserId);
    const page = this.resolvePage(browser, pageIndex);
    return await page.content();
  }

  async getUrl(browserId?: string, pageIndex?: number): Promise<string> {
    const browser = this.resolveBrowser(browserId);
    const page = this.resolvePage(browser, pageIndex);
    return page.url();
  }

  getBrowser(browserId?: string): ManagedBrowser | undefined {
    return this.browsers.get(browserId ?? this.defaultBrowserId ?? "");
  }

  getDefaultBrowserId(): string | null {
    return this.defaultBrowserId;
  }

  private findChrome(): string | null {
    const candidates = [
      // Windows
      "C:\\Program Files\\Google\\Chrome\\Application\\chrome.exe",
      "C:\\Program Files (x86)\\Google\\Chrome\\Application\\chrome.exe",
      process.env.LOCALAPPDATA + "\\Google\\Chrome\\Application\\chrome.exe",
      "C:\\Program Files\\Microsoft\\Edge\\Application\\msedge.exe",
      "C:\\Program Files (x86)\\Microsoft\\Edge\\Application\\msedge.exe",
      // macOS
      "/Applications/Google Chrome.app/Contents/MacOS/Google Chrome",
      "/Applications/Microsoft Edge.app/Contents/MacOS/Microsoft Edge",
      // Linux
      "/usr/bin/google-chrome",
      "/usr/bin/google-chrome-stable",
      "/usr/bin/chromium-browser",
      "/usr/bin/chromium",
      "/usr/bin/microsoft-edge",
      "/usr/bin/microsoft-edge-stable",
    ];
    for (const p of candidates) {
      if (p && existsSync(p)) return p;
    }
    return null;
  }
}
