import type { Page, BrowserContext } from "playwright-core";

export interface BrowserLaunchOptions {
  executablePath?: string;
  headless?: boolean;
  userDataDir?: string;
  args?: string[];
  proxy?: string;
  viewport?: { width: number; height: number };
}

export interface PageInfo {
  url: string;
  title: string;
  index: number;
}

export interface SnapshotNode {
  role: string;
  name: string;
  children?: SnapshotNode[];
  [key: string]: unknown;
}

export interface ScreenshotOptions {
  fullPage?: boolean;
  quality?: number;
  type?: "png" | "jpeg";
}

export interface ActionResult {
  success: boolean;
  message?: string;
  data?: unknown;
}

export interface PageState {
  url: string;
  title: string;
  platform: string | null;
  snapshot?: string;
  screenshot?: string;
}

export interface ServerConfig {
  port: number;
  host: string;
  authToken?: string;
}

export interface OCSConfig {
  answerApiUrl?: string;
  playbackRate?: number;
  volume?: number;
  autoSubmit?: boolean;
}

export interface PlatformInfo {
  id: string;
  name: string;
  domains: string[];
  detected: boolean;
}
