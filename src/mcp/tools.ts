import { BrowserController } from "../browser/controller.js";
import { OCSBridge } from "../platform/ocs-bridge.js";
import { PlatformDetector } from "../platform/detector.js";
import type { ServerConfig } from "../types.js";

/**
 * MCP (Model Context Protocol) 工具定义
 * 让 Claude / Codex 等 AI Agent 能直接调用浏览器操作
 */
export function createMCPTools(controller: BrowserController) {
  const bridge = new OCSBridge(controller);
  const detector = new PlatformDetector();

  return {
    tools: [
      {
        name: "browser_launch",
        description: "启动浏览器实例，返回浏览器 ID",
        inputSchema: {
          type: "object" as const,
          properties: {
            headless: { type: "boolean", description: "是否无头模式", default: false },
            executablePath: { type: "string", description: "浏览器可执行文件路径" },
          },
        },
        handler: async (args: any) => {
          const result = await controller.launch(args);
          return JSON.stringify(result);
        },
      },
      {
        name: "browser_close",
        description: "关闭浏览器实例",
        inputSchema: {
          type: "object" as const,
          properties: {
            browserId: { type: "string", description: "浏览器 ID" },
          },
        },
        handler: async (args: any) => {
          await controller.close(args.browserId);
          return "浏览器已关闭";
        },
      },
      {
        name: "browser_list",
        description: "列出所有运行中的浏览器实例",
        inputSchema: { type: "object" as const, properties: {} },
        handler: async () => {
          return JSON.stringify(controller.listBrowsers());
        },
      },
      {
        name: "page_navigate",
        description: "导航到指定 URL",
        inputSchema: {
          type: "object" as const,
          properties: {
            url: { type: "string", description: "目标 URL" },
            browserId: { type: "string" },
            pageIndex: { type: "number", default: 0 },
          },
          required: ["url"],
        },
        handler: async (args: any) => {
          const result = await controller.navigate(args.url, args.browserId, args.pageIndex);
          return JSON.stringify(result);
        },
      },
      {
        name: "page_screenshot",
        description: "截取页面截图（返回 base64）",
        inputSchema: {
          type: "object" as const,
          properties: {
            fullPage: { type: "boolean", default: false },
            browserId: { type: "string" },
            pageIndex: { type: "number", default: 0 },
          },
        },
        handler: async (args: any) => {
          const b64 = await controller.screenshot({ fullPage: args.fullPage }, args.browserId, args.pageIndex);
          return b64;
        },
      },
      {
        name: "page_snapshot",
        description: "获取页面无障碍树快照（Accessibility Snapshot）",
        inputSchema: {
          type: "object" as const,
          properties: {
            browserId: { type: "string" },
            pageIndex: { type: "number", default: 0 },
          },
        },
        handler: async (args: any) => {
          const snapshot = await controller.getSnapshot(args.browserId, args.pageIndex);
          return typeof snapshot === "string" ? snapshot : JSON.stringify(snapshot);
        },
      },
      {
        name: "page_content",
        description: "获取页面 HTML 内容",
        inputSchema: {
          type: "object" as const,
          properties: {
            browserId: { type: "string" },
            pageIndex: { type: "number", default: 0 },
          },
        },
        handler: async (args: any) => {
          return await controller.getContent(args.browserId, args.pageIndex);
        },
      },
      {
        name: "action_click",
        description: "点击页面元素",
        inputSchema: {
          type: "object" as const,
          properties: {
            selector: { type: "string", description: "CSS 选择器" },
            browserId: { type: "string" },
            pageIndex: { type: "number", default: 0 },
          },
          required: ["selector"],
        },
        handler: async (args: any) => {
          return JSON.stringify(await controller.click(args.selector, args.browserId, args.pageIndex));
        },
      },
      {
        name: "action_fill",
        description: "填写表单输入框",
        inputSchema: {
          type: "object" as const,
          properties: {
            selector: { type: "string", description: "CSS 选择器" },
            value: { type: "string", description: "填写内容" },
            browserId: { type: "string" },
            pageIndex: { type: "number", default: 0 },
          },
          required: ["selector", "value"],
        },
        handler: async (args: any) => {
          return JSON.stringify(await controller.fill(args.selector, args.value, args.browserId, args.pageIndex));
        },
      },
      {
        name: "action_select",
        description: "选择下拉框选项",
        inputSchema: {
          type: "object" as const,
          properties: {
            selector: { type: "string" },
            value: { type: "string" },
            browserId: { type: "string" },
            pageIndex: { type: "number", default: 0 },
          },
          required: ["selector", "value"],
        },
        handler: async (args: any) => {
          return JSON.stringify(await controller.select(args.selector, args.value, args.browserId, args.pageIndex));
        },
      },
      {
        name: "action_press",
        description: "按下键盘按键（如 Enter, Tab 等）",
        inputSchema: {
          type: "object" as const,
          properties: {
            key: { type: "string", description: "按键名称" },
            browserId: { type: "string" },
            pageIndex: { type: "number", default: 0 },
          },
          required: ["key"],
        },
        handler: async (args: any) => {
          return JSON.stringify(await controller.press(args.key, args.browserId, args.pageIndex));
        },
      },
      {
        name: "action_wait",
        description: "等待元素出现在页面上",
        inputSchema: {
          type: "object" as const,
          properties: {
            selector: { type: "string" },
            timeout: { type: "number", default: 30000 },
            browserId: { type: "string" },
            pageIndex: { type: "number", default: 0 },
          },
          required: ["selector"],
        },
        handler: async (args: any) => {
          return JSON.stringify(await controller.waitForSelector(args.selector, args.timeout, args.browserId, args.pageIndex));
        },
      },
      {
        name: "evaluate",
        description: "在页面中执行 JavaScript 代码",
        inputSchema: {
          type: "object" as const,
          properties: {
            expression: { type: "string", description: "JavaScript 表达式" },
            browserId: { type: "string" },
            pageIndex: { type: "number", default: 0 },
          },
          required: ["expression"],
        },
        handler: async (args: any) => {
          const result = await controller.evaluate(args.expression, args.browserId, args.pageIndex);
          return JSON.stringify(result);
        },
      },
      {
        name: "ocs_analyze",
        description: "分析当前页面，提取题目、媒体、平台信息（OCS 识别逻辑）",
        inputSchema: {
          type: "object" as const,
          properties: {
            browserId: { type: "string" },
            pageIndex: { type: "number", default: 0 },
          },
        },
        handler: async (args: any) => {
          return JSON.stringify(await bridge.analyzePage(args.browserId, args.pageIndex));
        },
      },
      {
        name: "ocs_questions",
        description: "提取页面上的所有题目",
        inputSchema: {
          type: "object" as const,
          properties: {
            browserId: { type: "string" },
            pageIndex: { type: "number", default: 0 },
          },
        },
        handler: async (args: any) => {
          const browser = controller.getBrowser(args.browserId);
          if (!browser) throw new Error("No browser running");
          const page = browser.context.pages()[args.pageIndex ?? 0];
          return JSON.stringify(await bridge.extractQuestions(page));
        },
      },
      {
        name: "ocs_media",
        description: "检测页面上的视频/音频媒体元素",
        inputSchema: {
          type: "object" as const,
          properties: {
            browserId: { type: "string" },
            pageIndex: { type: "number", default: 0 },
          },
        },
        handler: async (args: any) => {
          const browser = controller.getBrowser(args.browserId);
          if (!browser) throw new Error("No browser running");
          const page = browser.context.pages()[args.pageIndex ?? 0];
          return JSON.stringify(await bridge.detectMedia(page));
        },
      },
      {
        name: "ocs_media_control",
        description: "控制媒体播放：play/pause/setRate/setVolume",
        inputSchema: {
          type: "object" as const,
          properties: {
            action: { type: "string", enum: ["play", "pause", "setRate", "setVolume"] },
            value: { type: "number", description: "速率或音量值" },
            browserId: { type: "string" },
            pageIndex: { type: "number", default: 0 },
          },
          required: ["action"],
        },
        handler: async (args: any) => {
          return JSON.stringify(await bridge.controlMedia(args.action, args.value, args.browserId, args.pageIndex));
        },
      },
      {
        name: "ocs_select_answer",
        description: "选择题目答案（通过文本匹配，ocsjs 风格的相似度匹配）",
        inputSchema: {
          type: "object" as const,
          properties: {
            questionText: { type: "string", description: "题目文本" },
            answerText: { type: "string", description: "答案文本" },
            matchMode: { type: "string", enum: ["exact", "similar"], default: "similar" },
            browserId: { type: "string" },
            pageIndex: { type: "number", default: 0 },
          },
          required: ["questionText", "answerText"],
        },
        handler: async (args: any) => {
          return JSON.stringify(await bridge.selectAnswer(args.questionText, args.answerText, args.matchMode, args.browserId, args.pageIndex));
        },
      },
      {
        name: "platform_detect",
        description: "检测 URL 对应的课程平台",
        inputSchema: {
          type: "object" as const,
          properties: {
            url: { type: "string" },
          },
          required: ["url"],
        },
        handler: async (args: any) => {
          return JSON.stringify(detector.detect(args.url) ?? { detected: false });
        },
      },
    ],
  };
}
