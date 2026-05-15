/**
 * OCS-CLI 答案服务
 *
 * 作为 ocsjs 的 answererWrapper 后端运行。
 * ocsjs 检测到题目后查询本服务，本服务按优先级返回答案。
 *
 * 答案来源优先级：
 * 1. 本地缓存
 * 2. 官方题库 API（用户配置）
 * 3. LLM API（用户配置）
 * 4. 排队等 Agent 回答
 */

import { createServer, type Server } from "node:http";
import { readFileSync, writeFileSync, existsSync, mkdirSync } from "node:fs";
import { join } from "node:path";
import { homedir } from "node:os";

const CONFIG_DIR = join(homedir(), ".ocs-cli");
const CONFIG_FILE = join(CONFIG_DIR, "answer-config.json");
const CACHE_FILE = join(CONFIG_DIR, "answer-cache.json");

export interface AnswerConfig {
  /** 答案服务端口 */
  port: number;
  /** 题库 API 列表 */
  tiku: TikuSource[];
  /** LLM API 配置 */
  llm?: LLMConfig;
  /** 缓存大小限制 */
  cacheLimit: number;
  /** 置信度阈值 */
  confidence: number;
}

export interface TikuSource {
  name: string;
  url: string;
  method?: string;
  headers?: Record<string, string>;
  /** ocsjs 格式的 handler 函数字符串 */
  handler?: string;
  enabled: boolean;
}

export interface LLMConfig {
  api: string;
  model: string;
  apiKey: string;
  prompt: string;
  temperature: number;
  maxTokens: number;
}

export interface QuestionRequest {
  /** 题目文本 */
  title: string;
  /** 题目类型: single/multiple/judgement/completion */
  type?: string;
  /** 选项列表 */
  options?: string[];
}

export interface AnswerResult {
  /** 答案文本 */
  answer: string;
  /** 来源: cache/tiku/llm/none */
  source: string;
  /** 置信度 0-1 */
  confidence: number;
}

interface CacheEntry {
  title: string;
  answer: string;
  source: string;
  time: number;
}

const DEFAULT_CONFIG: AnswerConfig = {
  port: 17901,
  tiku: [],
  cacheLimit: 500,
  confidence: 0.6,
};

export class AnswerService {
  private config: AnswerConfig;
  private cache: Map<string, CacheEntry> = new Map();
  private server: Server | null = null;
  private questionQueue: Map<string, { resolve: (answer: string) => void; time: number }> = new Map();

  constructor(config?: Partial<AnswerConfig>) {
    this.config = { ...DEFAULT_CONFIG, ...config };
    this.loadConfig();
    this.loadCache();
  }

  // ── 配置管理 ──

  private loadConfig() {
    try {
      if (existsSync(CONFIG_FILE)) {
        const saved = JSON.parse(readFileSync(CONFIG_FILE, "utf-8"));
        this.config = { ...this.config, ...saved };
      }
    } catch {}
  }

  private saveConfig() {
    try {
      mkdirSync(CONFIG_DIR, { recursive: true });
      writeFileSync(CONFIG_FILE, JSON.stringify(this.config, null, 2));
    } catch {}
  }

  private loadCache() {
    try {
      if (existsSync(CACHE_FILE)) {
        const entries: CacheEntry[] = JSON.parse(readFileSync(CACHE_FILE, "utf-8"));
        for (const e of entries) this.cache.set(e.title, e);
      }
    } catch {}
  }

  private saveCache() {
    try {
      mkdirSync(CONFIG_DIR, { recursive: true });
      const entries = Array.from(this.cache.values()).slice(-this.config.cacheLimit);
      writeFileSync(CACHE_FILE, JSON.stringify(entries, null, 2));
    } catch {}
  }

  // ── 配置操作 ──

  getConfig(): AnswerConfig {
    return { ...this.config };
  }

  updateConfig(patch: Partial<AnswerConfig>) {
    Object.assign(this.config, patch);
    this.saveConfig();
  }

  addTiku(source: TikuSource) {
    this.config.tiku.push(source);
    this.saveConfig();
  }

  setLLM(config: LLMConfig) {
    this.config.llm = config;
    this.saveConfig();
  }

  // ── 答案查询 ──

  async query(req: QuestionRequest): Promise<AnswerResult> {
    // 1. 查缓存
    const cached = this.cache.get(req.title);
    if (cached) {
      return { answer: cached.answer, source: "cache", confidence: 1 };
    }

    // 2. 查题库 API
    for (const tiku of this.config.tiku.filter((t) => t.enabled)) {
      try {
        const result = await this.queryTiku(tiku, req);
        if (result && result.answer) {
          this.addToCache(req.title, result.answer, "tiku:" + tiku.name);
          return { answer: result.answer, source: "tiku:" + tiku.name, confidence: result.confidence || 0.8 };
        }
      } catch {}
    }

    // 3. 查 LLM API
    if (this.config.llm) {
      try {
        const answer = await this.queryLLM(req);
        if (answer) {
          this.addToCache(req.title, answer, "llm");
          return { answer, source: "llm", confidence: 0.7 };
        }
      } catch {}
    }

    // 4. 无法回答
    return { answer: "", source: "none", confidence: 0 };
  }

  private async queryTiku(tiku: TikuSource, req: QuestionRequest): Promise<{ answer: string; confidence: number } | null> {
    const method = tiku.method?.toUpperCase() || "GET";
    const headers = { "Content-Type": "application/json", ...tiku.headers };

    let url = tiku.url;
    let body: string | undefined;

    if (method === "GET") {
      url += (url.includes("?") ? "&" : "?") + `title=${encodeURIComponent(req.title)}`;
    } else {
      body = JSON.stringify({ title: req.title, type: req.type, options: req.options });
    }

    const resp = await fetch(url, { method, headers, body });
    if (!resp.ok) return null;

    const data = await resp.json() as any;

    // 如果有 handler 函数，用它解析响应
    if (tiku.handler) {
      try {
        const fn = new Function("response", tiku.handler);
        const parsed = fn(data);
        if (Array.isArray(parsed) && parsed.length > 0) {
          return { answer: parsed[0].answer || parsed[0], confidence: parsed[0].confidence || 0.8 };
        }
      } catch {}
    }

    // 默认解析: 尝试常见字段名
    const answer = data.answer || data.data?.answer || data.result?.answer || "";
    return answer ? { answer: String(answer), confidence: 0.8 } : null;
  }

  private async queryLLM(req: QuestionRequest): Promise<string | null> {
    const llm = this.config.llm;
    if (!llm) return null;

    const prompt = (llm.prompt || "你是网课答题助手，直接给出答案。")
      .replace("{question}", req.title)
      .replace("{type}", req.type || "unknown")
      .replace("{options}", (req.options || []).join(", "));

    const resp = await fetch(llm.api, {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
        Authorization: `Bearer ${llm.apiKey}`,
      },
      body: JSON.stringify({
        model: llm.model,
        messages: [{ role: "user", content: prompt }],
        temperature: llm.temperature || 0.1,
        max_tokens: llm.maxTokens || 200,
      }),
    });

    if (!resp.ok) return null;
    const data = await resp.json() as any;
    const content = data.choices?.[0]?.message?.content || "";
    return content.trim() || null;
  }

  private addToCache(title: string, answer: string, source: string) {
    this.cache.set(title, { title, answer, source, time: Date.now() });
    if (this.cache.size > this.config.cacheLimit * 1.2) {
      this.saveCache();
    }
  }

  // ── Agent 队列（Agent 直答模式） ──

  /** 提交问题到队列，等待 Agent 回答 */
  async queueQuestion(req: QuestionRequest): Promise<string> {
    return new Promise((resolve) => {
      const key = req.title;
      this.questionQueue.set(key, { resolve, time: Date.now() });
      // 30 秒超时
      setTimeout(() => {
        if (this.questionQueue.has(key)) {
          this.questionQueue.delete(key);
          resolve("");
        }
      }, 30000);
    });
  }

  /** Agent 提交答案 */
  answerQuestion(title: string, answer: string) {
    const pending = this.questionQueue.get(title);
    if (pending) {
      this.questionQueue.delete(title);
      this.addToCache(title, answer, "agent");
      pending.resolve(answer);
    }
  }

  /** 获取待回答的题目队列 */
  getPendingQuestions(): string[] {
    return Array.from(this.questionQueue.keys());
  }

  // ── 缓存操作 ──

  getCache(): CacheEntry[] {
    return Array.from(this.cache.values());
  }

  clearCache() {
    this.cache.clear();
    try {
      if (existsSync(CACHE_FILE)) writeFileSync(CACHE_FILE, "[]");
    } catch {}
  }

  // ── HTTP 服务 ──

  async start(): Promise<number> {
    return new Promise((resolve, reject) => {
      const server = createServer(async (req, res) => {
        res.setHeader("Access-Control-Allow-Origin", "*");
        res.setHeader("Access-Control-Allow-Methods", "GET, POST, DELETE, OPTIONS");
        res.setHeader("Access-Control-Allow-Headers", "Content-Type");
        if (req.method === "OPTIONS") { res.writeHead(204); res.end(); return; }

        const url = new URL(req.url || "/", `http://localhost:${this.config.port}`);
        const json = (data: any, status = 200) => {
          res.writeHead(status, { "Content-Type": "application/json; charset=utf-8" });
          res.end(JSON.stringify(data));
        };

        let body = "";
        req.on("data", (c) => (body += c));
        req.on("end", async () => {
          try {
            const params = body ? JSON.parse(body) : {};

            // 健康检查
            if (url.pathname === "/health") {
              return json({ status: "ok", cache: this.cache.size, queue: this.questionQueue.size });
            }

            // ocsjs 查询入口（兼容 answererWrapper 格式）
            if (url.pathname === "/query" && req.method === "POST") {
              const result = await this.query({
                title: params.title || params.question || "",
                type: params.type,
                options: params.options,
              });
              // 返回 ocsjs 期望的格式: [[question, answer]]
              return json([[params.title || params.question || "", result.answer]]);
            }

            // 详细查询（带来源信息）
            if (url.pathname === "/query/detail" && req.method === "POST") {
              const result = await this.query({
                title: params.title || params.question || "",
                type: params.type,
                options: params.options,
              });
              return json(result);
            }

            // Agent 提交答案
            if (url.pathname === "/answer" && req.method === "POST") {
              this.answerQuestion(params.title, params.answer);
              return json({ success: true });
            }

            // 查看队列
            if (url.pathname === "/queue") {
              return json({ pending: this.getPendingQuestions() });
            }

            // 缓存管理
            if (url.pathname === "/cache" && req.method === "GET") {
              return json({ entries: this.getCache(), size: this.cache.size });
            }
            if (url.pathname === "/cache" && req.method === "DELETE") {
              this.clearCache();
              return json({ success: true });
            }

            // 配置
            if (url.pathname === "/config" && req.method === "GET") {
              const cfg = this.getConfig();
              // 隐藏 API key
              if (cfg.llm?.apiKey) cfg.llm = { ...cfg.llm, apiKey: "***" };
              return json(cfg);
            }
            if (url.pathname === "/config" && req.method === "POST") {
              this.updateConfig(params);
              return json({ success: true });
            }

            json({ error: "未知端点: " + url.pathname }, 404);
          } catch (e: any) {
            json({ error: e.message }, 500);
          }
        });
      });

      this.server = server;
      server.on("error", reject);
      server.listen(this.config.port, "127.0.0.1", () => {
        resolve(this.config.port);
      });
    });
  }

  async stop() {
    if (this.server) {
      this.saveCache();
      this.server.close();
      this.server = null;
    }
  }

  /** 生成 ocsjs answererWrapper 配置 */
  toAnswererWrapper() {
    return {
      url: `http://127.0.0.1:${this.config.port}/query`,
      method: "POST",
      headers: { "Content-Type": "application/json" },
      type: "json",
      handler: "return response",
    };
  }
}
