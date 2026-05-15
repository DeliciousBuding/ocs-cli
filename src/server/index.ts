import express from "express";
import cors from "cors";
import type { Server } from "node:http";
import { BrowserController } from "../browser/controller.js";
import { OCSBridge } from "../platform/ocs-bridge.js";
import { PlatformDetector } from "../platform/detector.js";
import type { ServerConfig } from "../types.js";

export function createServer(controller: BrowserController, config: ServerConfig) {
  const app = express();
  const bridge = new OCSBridge(controller);
  const detector = new PlatformDetector();

  app.use(cors());
  app.use(express.json({ limit: "10mb" }));

  // Auth middleware
  if (config.authToken) {
    app.use((req, res, next) => {
      const token = req.headers.authorization?.replace("Bearer ", "") ?? req.query.token;
      if (token !== config.authToken) {
        res.status(401).json({ error: "Unauthorized" });
        return;
      }
      next();
    });
  }

  // --- Health / Doctor ---
  app.get("/health", (_req, res) => {
    res.json({ status: "ok", browsers: controller.listBrowsers().length });
  });

  app.get("/discover", async (_req, res) => {
    // 发现 ocs-desktop 实例
    try {
      const resp = await fetch("http://127.0.0.1:15319/agent");
      if (resp.ok) {
        const info = await resp.json() as any;
        res.json({ found: true, ...info });
      } else {
        res.json({ found: false, message: "ocs-desktop 主服务未响应" });
      }
    } catch {
      res.json({ found: false, message: "ocs-desktop 未运行（端口 15319 不可达）" });
    }
  });

  app.get("/doctor", (_req, res) => {
    const browsers = controller.listBrowsers();
    res.json({
      status: "ok",
      browsers,
      defaultBrowser: controller.getDefaultBrowserId(),
      platforms: detector.listPlatforms(),
    });
  });

  // --- Browser lifecycle ---
  app.post("/browser/launch", async (req, res) => {
    try {
      const result = await controller.launch(req.body ?? {});
      res.json(result);
    } catch (e: any) {
      res.status(500).json({ error: e.message });
    }
  });

  app.post("/browser/connect", async (req, res) => {
    try {
      const { agentPort } = req.body ?? {};
      const result = await controller.connectToDesktop(agentPort ?? 17900);
      res.json(result);
    } catch (e: any) {
      res.status(500).json({ error: e.message });
    }
  });

  app.post("/browser/close", async (req, res) => {
    try {
      await controller.close(req.body?.browserId);
      res.json({ success: true });
    } catch (e: any) {
      res.status(500).json({ error: e.message });
    }
  });

  app.get("/browser/list", (_req, res) => {
    res.json(controller.listBrowsers());
  });

  // --- Page operations ---
  app.get("/pages", async (req, res) => {
    try {
      const pages = await controller.listPages(req.query.browserId as string);
      res.json(pages);
    } catch (e: any) {
      res.status(500).json({ error: e.message });
    }
  });

  app.post("/page/navigate", async (req, res) => {
    try {
      const { url, browserId, pageIndex } = req.body;
      const result = await controller.navigate(url, browserId, pageIndex);
      res.json(result);
    } catch (e: any) {
      res.status(500).json({ error: e.message });
    }
  });

  app.post("/page/new", async (req, res) => {
    try {
      const { url, browserId } = req.body;
      const result = await controller.newPage(url, browserId);
      res.json(result);
    } catch (e: any) {
      res.status(500).json({ error: e.message });
    }
  });

  app.post("/page/close", async (req, res) => {
    try {
      const { browserId, pageIndex } = req.body;
      const result = await controller.closePage(browserId, pageIndex);
      res.json(result);
    } catch (e: any) {
      res.status(500).json({ error: e.message });
    }
  });

  app.get("/page/state", async (req, res) => {
    try {
      const state = await controller.getPageState(
        req.query.browserId as string,
        req.query.pageIndex ? Number(req.query.pageIndex) : undefined
      );
      res.json(state);
    } catch (e: any) {
      res.status(500).json({ error: e.message });
    }
  });

  app.get("/page/content", async (req, res) => {
    try {
      const content = await controller.getContent(
        req.query.browserId as string,
        req.query.pageIndex ? Number(req.query.pageIndex) : undefined
      );
      res.type("html").send(content);
    } catch (e: any) {
      res.status(500).json({ error: e.message });
    }
  });

  // --- Perception ---
  app.get("/page/screenshot", async (req, res) => {
    try {
      const b64 = await controller.screenshot(
        {
          fullPage: req.query.fullPage === "true",
          type: req.query.type as "png" | "jpeg",
          quality: req.query.quality ? Number(req.query.quality) : undefined,
        },
        req.query.browserId as string,
        req.query.pageIndex ? Number(req.query.pageIndex) : undefined
      );
      res.json({ screenshot: b64 });
    } catch (e: any) {
      res.status(500).json({ error: e.message });
    }
  });

  app.get("/page/snapshot", async (req, res) => {
    try {
      const snapshot = await controller.getSnapshot(
        req.query.browserId as string,
        req.query.pageIndex ? Number(req.query.pageIndex) : undefined
      );
      res.json({ snapshot });
    } catch (e: any) {
      res.status(500).json({ error: e.message });
    }
  });

  // --- Actions ---
  app.post("/action/click", async (req, res) => {
    try {
      const { selector, browserId, pageIndex } = req.body;
      const result = await controller.click(selector, browserId, pageIndex);
      res.json(result);
    } catch (e: any) {
      res.status(500).json({ error: e.message });
    }
  });

  app.post("/action/fill", async (req, res) => {
    try {
      const { selector, value, browserId, pageIndex } = req.body;
      const result = await controller.fill(selector, value, browserId, pageIndex);
      res.json(result);
    } catch (e: any) {
      res.status(500).json({ error: e.message });
    }
  });

  app.post("/action/select", async (req, res) => {
    try {
      const { selector, value, browserId, pageIndex } = req.body;
      const result = await controller.select(selector, value, browserId, pageIndex);
      res.json(result);
    } catch (e: any) {
      res.status(500).json({ error: e.message });
    }
  });

  app.post("/action/press", async (req, res) => {
    try {
      const { key, browserId, pageIndex } = req.body;
      const result = await controller.press(key, browserId, pageIndex);
      res.json(result);
    } catch (e: any) {
      res.status(500).json({ error: e.message });
    }
  });

  app.post("/action/type", async (req, res) => {
    try {
      const { selector, text, delay, browserId, pageIndex } = req.body;
      const result = await controller.type(selector, text, browserId, pageIndex, delay);
      res.json(result);
    } catch (e: any) {
      res.status(500).json({ error: e.message });
    }
  });

  app.post("/action/hover", async (req, res) => {
    try {
      const { selector, browserId, pageIndex } = req.body;
      const result = await controller.hover(selector, browserId, pageIndex);
      res.json(result);
    } catch (e: any) {
      res.status(500).json({ error: e.message });
    }
  });

  app.post("/action/wait", async (req, res) => {
    try {
      const { selector, timeout, browserId, pageIndex } = req.body;
      const result = await controller.waitForSelector(selector, timeout, browserId, pageIndex);
      res.json(result);
    } catch (e: any) {
      res.status(500).json({ error: e.message });
    }
  });

  // --- Evaluate ---
  app.post("/eval", async (req, res) => {
    try {
      const { expression, args, browserId, pageIndex } = req.body;
      let result: unknown;
      if (args && args.length > 0) {
        result = await controller.evaluateWithArgs(expression, args, browserId, pageIndex);
      } else {
        result = await controller.evaluate(expression, browserId, pageIndex);
      }
      res.json({ result });
    } catch (e: any) {
      res.status(500).json({ error: e.message });
    }
  });

  // --- OCS Bridge (platform-specific) ---
  app.get("/ocs/analyze", async (req, res) => {
    try {
      const result = await bridge.analyzePage(
        req.query.browserId as string,
        req.query.pageIndex ? Number(req.query.pageIndex) : undefined
      );
      res.json(result);
    } catch (e: any) {
      res.status(500).json({ error: e.message });
    }
  });

  app.get("/ocs/questions", async (req, res) => {
    try {
      const browser = controller.getBrowser(req.query.browserId as string);
      if (!browser) throw new Error("No browser running");
      if (browser.agentUrl) {
        const resp = await fetch(`${browser.agentUrl}/agent/ocs-analyze`, {
          method: "POST", headers: { "Content-Type": "application/json" },
          body: JSON.stringify({ pageIndex: Number(req.query.pageIndex ?? 0) }),
        });
        const data = await resp.json() as any;
        return res.json(data.questions ?? []);
      }
      const page = browser.context?.pages()[Number(req.query.pageIndex ?? 0)];
      if (!page) throw new Error("Page not found");
      const questions = await bridge.extractQuestions(page);
      res.json(questions);
    } catch (e: any) {
      res.status(500).json({ error: e.message });
    }
  });

  app.get("/ocs/media", async (req, res) => {
    try {
      const browser = controller.getBrowser(req.query.browserId as string);
      if (!browser) throw new Error("No browser running");
      if (browser.agentUrl) {
        const resp = await fetch(`${browser.agentUrl}/agent/media?pageIndex=${req.query.pageIndex ?? 0}`);
        return res.json(await resp.json());
      }
      const page = browser.context?.pages()[Number(req.query.pageIndex ?? 0)];
      if (!page) throw new Error("Page not found");
      const media = await bridge.detectMedia(page);
      res.json(media);
    } catch (e: any) {
      res.status(500).json({ error: e.message });
    }
  });

  app.post("/ocs/media/control", async (req, res) => {
    try {
      const { action, value, browserId, pageIndex } = req.body;
      const result = await bridge.controlMedia(action, value, browserId, pageIndex);
      res.json(result);
    } catch (e: any) {
      res.status(500).json({ error: e.message });
    }
  });

  app.post("/ocs/answer", async (req, res) => {
    try {
      const { questionText, answerText, matchMode, browserId, pageIndex } = req.body;
      const result = await bridge.selectAnswer(questionText, answerText, matchMode, browserId, pageIndex);
      res.json(result);
    } catch (e: any) {
      res.status(500).json({ error: e.message });
    }
  });

  // --- iframe 操作 ---
  app.get("/iframe/list", async (req, res) => {
    try {
      const result = await controller.listIframes(
        req.query.browserId as string,
        req.query.pageIndex ? Number(req.query.pageIndex) : undefined
      );
      res.json(result);
    } catch (e: any) {
      res.status(500).json({ error: e.message });
    }
  });

  app.post("/iframe/eval", async (req, res) => {
    try {
      const { expression, iframeIndex, browserId, pageIndex } = req.body;
      const result = await controller.iframeEval(expression, iframeIndex, browserId, pageIndex);
      res.json({ result });
    } catch (e: any) {
      res.status(500).json({ error: e.message });
    }
  });

  app.post("/iframe/media", async (req, res) => {
    try {
      const { iframeIndex, browserId, pageIndex } = req.body;
      const result = await controller.iframeMedia(iframeIndex, browserId, pageIndex);
      res.json(result);
    } catch (e: any) {
      res.status(500).json({ error: e.message });
    }
  });

  app.post("/iframe/media/control", async (req, res) => {
    try {
      const { action, value, iframeIndex, browserId, pageIndex } = req.body;
      const result = await controller.iframeMediaControl(action, value, iframeIndex, browserId, pageIndex);
      res.json(result);
    } catch (e: any) {
      res.status(500).json({ error: e.message });
    }
  });

  app.post("/iframe/questions", async (req, res) => {
    try {
      const { iframeIndex, browserId, pageIndex } = req.body;
      const result = await controller.iframeQuestions(iframeIndex, browserId, pageIndex);
      res.json(result);
    } catch (e: any) {
      res.status(500).json({ error: e.message });
    }
  });

  app.post("/iframe/answer", async (req, res) => {
    try {
      const { questionText, answerText, matchMode, iframeIndex, browserId, pageIndex } = req.body;
      const result = await controller.iframeAnswer(questionText, answerText, matchMode, iframeIndex, browserId, pageIndex);
      res.json(result);
    } catch (e: any) {
      res.status(500).json({ error: e.message });
    }
  });

  // --- Platform info ---
  app.get("/platform/detect", (req, res) => {
    const url = req.query.url as string;
    if (!url) {
      res.status(400).json({ error: "url parameter required" });
      return;
    }
    const result = detector.detect(url);
    res.json(result ?? { detected: false });
  });

  app.get("/platform/list", (_req, res) => {
    res.json(detector.listPlatforms());
  });

  // Start server
  let server: Server;

  return {
    app,
    start(): Promise<number> {
      return new Promise((resolve, reject) => {
        server = app.listen(config.port, config.host, () => {
          resolve(config.port);
        });
        server.on("error", reject);
      });
    },
    stop(): Promise<void> {
      return new Promise((resolve) => {
        if (server) server.close(() => resolve());
        else resolve();
      });
    },
  };
}
