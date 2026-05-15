import type { Page } from "playwright-core";
import type { BrowserController } from "../browser/controller.js";
import type { OCSConfig, ActionResult } from "../types.js";

/**
 * OCSBridge injects ocsjs recognition logic into browser pages
 * and exposes high-level operations for agents.
 *
 * Instead of loading the full userscript (which requires Tampermonkey),
 * we inject the core recognition/answer-matching logic directly via page.evaluate().
 */
export class OCSBridge {
  private controller: BrowserController;

  constructor(controller: BrowserController) {
    this.controller = controller;
  }

  /**
   * Get page analysis: detect platform, extract questions, detect media, etc.
   */
  async analyzePage(browserId?: string, pageIndex?: number): Promise<{
    url: string;
    title: string;
    questions: QuestionInfo[];
    media: MediaInfo[];
    platform: string | null;
  }> {
    const browser = this.controller.getBrowser(browserId);
    if (!browser) throw new Error("No browser running");
    const page = browser.context?.pages()[pageIndex ?? 0];
    if (!page) throw new Error(`Page ${pageIndex ?? 0} not found`);

    const url = page.url();
    const title = await page.title().catch(() => "");

    const questions = await this.extractQuestions(page);
    const media = await this.detectMedia(page);
    const platform = detectPlatformFromUrl(url);

    return { url, title, questions, media, platform };
  }

  /**
   * Extract all visible questions from the page.
   * Uses ocsjs-style CSS selectors for different platforms.
   */
  async extractQuestions(page: Page): Promise<QuestionInfo[]> {
    return await page.evaluate(() => {
      const questions: QuestionInfo[] = [];

      // Generic question selectors (covers most platforms)
      const selectors = [
        ".questionLi",        // Chaoxing
        ".TiMu",              // Chaoxing tests
        ".question-item",     // Generic
        ".problem-item",      // MOOC
        ".exam-question",     // Generic exam
        "[class*='question']", // Fallback
      ];

      let elements: Element[] = [];
      for (const sel of selectors) {
        elements = Array.from(document.querySelectorAll(sel));
        if (elements.length > 0) break;
      }

      // Also search within iframes
      const iframes = Array.from(document.querySelectorAll("iframe"));
      for (const iframe of iframes) {
        try {
          const doc = iframe.contentDocument;
          if (!doc) continue;
          for (const sel of selectors) {
            const found = Array.from(doc.querySelectorAll(sel));
            if (found.length > 0) {
              elements = found;
              break;
            }
          }
        } catch {
          // cross-origin iframe, skip
        }
      }

      for (const el of elements) {
        const question: QuestionInfo = {
          text: "",
          type: "unknown",
          options: [],
        };

        // Extract question text
        const titleEl =
          el.querySelector(".Zy_TItle .clearfix, .mark_name, .question-title, .stem, h3, .title") ??
          el.querySelector("[class*='title'], [class*='stem'], [class*='question']");
        if (titleEl) {
          question.text = (titleEl.textContent ?? "").trim().replace(/^\d+[.、]\s*/, "");
        }

        // Detect type
        const radios = el.querySelectorAll('input[type="radio"]');
        const checkboxes = el.querySelectorAll('input[type="checkbox"]');
        const textareas = el.querySelectorAll("textarea, [contenteditable='true']");

        if (radios.length === 2) {
          question.type = "judgement";
        } else if (radios.length > 0) {
          question.type = "single";
        } else if (checkboxes.length > 0) {
          question.type = "multiple";
        } else if (textareas.length > 0) {
          question.type = "completion";
        }

        // Extract options
        const optionEls = el.querySelectorAll(
          ".Zy_ulBottom li, .option-item, .answer-item, [class*='option'], [class*='answer'] li"
        );
        for (const opt of optionEls) {
          const text = (opt.textContent ?? "").trim().replace(/^[A-Z][.、]\s*/, "");
          if (text) {
            question.options.push({
              text,
              value: text,
              element: opt.tagName + (opt.id ? `#${opt.id}` : "") + (opt.className ? `.${String(opt.className).split(" ")[0]}` : ""),
            });
          }
        }

        if (question.text) {
          questions.push(question);
        }
      }

      return questions;
    });
  }

  /**
   * Detect video/audio media elements on the page.
   */
  async detectMedia(page: Page): Promise<MediaInfo[]> {
    return await page.evaluate(() => {
      const media: MediaInfo[] = [];
      const elements = document.querySelectorAll("video, audio");

      // Also check iframes
      const allDocs: Document[] = [document];
      document.querySelectorAll("iframe").forEach((iframe) => {
        try {
          if (iframe.contentDocument) allDocs.push(iframe.contentDocument);
        } catch {}
      });

      for (const doc of allDocs) {
        for (const el of doc.querySelectorAll("video, audio")) {
          const m = el as HTMLMediaElement;
          media.push({
            type: m.tagName.toLowerCase() as "video" | "audio",
            src: m.src || m.currentSrc || "",
            duration: m.duration || 0,
            currentTime: m.currentTime || 0,
            paused: m.paused,
            ended: m.ended,
            playbackRate: m.playbackRate,
          });
        }
      }
      return media;
    });
  }

  /**
   * Control media playback: play, pause, set rate, set volume
   */
  async controlMedia(action: "play" | "pause" | "setRate" | "setVolume", value?: number, browserId?: string, pageIndex?: number): Promise<ActionResult> {
    const browser = this.controller.getBrowser(browserId);
    if (!browser) throw new Error("No browser running");
    const page = browser.context?.pages()[pageIndex ?? 0];
    if (!page) throw new Error(`Page ${pageIndex ?? 0} not found`);

    const result = await page.evaluate(({ action, value }) => {
      const media = document.querySelector("video, audio") as HTMLMediaElement | null;
      if (!media) return { success: false, message: "No media element found" };

      switch (action) {
        case "play":
          media.play();
          return { success: true, message: "Playing" };
        case "pause":
          media.pause();
          return { success: true, message: "Paused" };
        case "setRate":
          if (value !== undefined) media.playbackRate = value;
          return { success: true, message: `Rate set to ${media.playbackRate}` };
        case "setVolume":
          if (value !== undefined) media.volume = Math.min(1, Math.max(0, value));
          return { success: true, message: `Volume set to ${media.volume}` };
        default:
          return { success: false, message: `Unknown action: ${action}` };
      }
    }, { action, value });

    return result as ActionResult;
  }

  /**
   * Select an answer option by text matching (ocsjs-style similarity matching)
   */
  async selectAnswer(
    questionText: string,
    answerText: string,
    matchMode: "exact" | "similar" = "similar",
    browserId?: string,
    pageIndex?: number
  ): Promise<ActionResult> {
    const browser = this.controller.getBrowser(browserId);
    if (!browser) throw new Error("No browser running");
    const page = browser.context?.pages()[pageIndex ?? 0];
    if (!page) throw new Error(`Page ${pageIndex ?? 0} not found`);

    const result = await page.evaluate(
      ({ questionText, answerText, matchMode }) => {
        // Find the question element containing this text
        const selectors = [".questionLi", ".TiMu", ".question-item", ".problem-item", "[class*='question']"];
        let questionEl: Element | null = null;

        for (const sel of selectors) {
          for (const el of document.querySelectorAll(sel)) {
            if ((el.textContent ?? "").includes(questionText.slice(0, 30))) {
              questionEl = el;
              break;
            }
          }
          if (questionEl) break;
        }

        // Also check iframes
        if (!questionEl) {
          for (const iframe of document.querySelectorAll("iframe")) {
            try {
              const doc = iframe.contentDocument;
              if (!doc) continue;
              for (const sel of selectors) {
                for (const el of doc.querySelectorAll(sel)) {
                  if ((el.textContent ?? "").includes(questionText.slice(0, 30))) {
                    questionEl = el;
                    break;
                  }
                }
                if (questionEl) break;
              }
            } catch {}
            if (questionEl) break;
          }
        }

        if (!questionEl) return { success: false, message: "Question not found" };

        // Simple dice-coefficient similarity
        function dice(a: string, b: string): number {
          if (a === b) return 1;
          if (a.length < 2 || b.length < 2) return 0;
          const bigramsA = new Set<string>();
          for (let i = 0; i < a.length - 1; i++) bigramsA.add(a.slice(i, i + 2));
          let hits = 0;
          for (let i = 0; i < b.length - 1; i++) {
            if (bigramsA.has(b.slice(i, i + 2))) hits++;
          }
          return (2 * hits) / (a.length + b.length - 2);
        }

        // Find matching option
        const options = questionEl.querySelectorAll(
          'input[type="radio"], input[type="checkbox"], .option-item, [class*="option"] li, .Zy_ulBottom li'
        );

        let bestMatch: Element | null = null;
        let bestScore = 0;

        for (const opt of options) {
          const optText = (opt.textContent ?? "").trim().replace(/^[A-Z][.、]\s*/, "");
          let score = 0;
          if (matchMode === "exact") {
            score = optText === answerText ? 1 : 0;
          } else {
            score = dice(optText, answerText);
            if (optText.includes(answerText) || answerText.includes(optText)) {
              score = Math.max(score, 0.8);
            }
          }
          if (score > bestScore) {
            bestScore = score;
            bestMatch = opt;
          }
        }

        if (!bestMatch || bestScore < 0.3) {
          return { success: false, message: `No matching option found (best score: ${bestScore.toFixed(2)})` };
        }

        // Click the match
        const clickTarget = bestMatch.querySelector('input[type="radio"], input[type="checkbox"]') ?? bestMatch;
        (clickTarget as HTMLElement).click();
        return { success: true, message: `Selected: ${(bestMatch.textContent ?? "").trim()}`, score: bestScore };
      },
      { questionText, answerText, matchMode }
    );

    return result as ActionResult;
  }
}

// --- Helper types ---

interface QuestionInfo {
  text: string;
  type: "single" | "multiple" | "judgement" | "completion" | "unknown";
  options: { text: string; value: string; element: string }[];
}

interface MediaInfo {
  type: "video" | "audio";
  src: string;
  duration: number;
  currentTime: number;
  paused: boolean;
  ended: boolean;
  playbackRate: number;
}

function detectPlatformFromUrl(url: string): string | null {
  const platforms: Record<string, string[]> = {
    cx: ["chaoxing.com", "xueyinonline.com"],
    zhs: ["zhihuishu.com", "studywisdom.com"],
    icve: ["icve.com.cn", "courshare.cn", "webtrn.cn"],
    zjy: ["zjy2.icve.com.cn", "zyk.icve.com.cn"],
    icourse: ["icourse163.org"],
    yuketang: ["yuketang.cn"],
  };
  try {
    const hostname = new URL(url).hostname.toLowerCase();
    for (const [id, domains] of Object.entries(platforms)) {
      if (domains.some((d) => hostname.endsWith(d))) return id;
    }
  } catch {}
  return null;
}
