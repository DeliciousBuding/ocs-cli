import type { PlatformInfo } from "../types.js";

interface PlatformDef {
  id: string;
  name: string;
  domains: string[];
}

const PLATFORMS: PlatformDef[] = [
  {
    id: "cx",
    name: "超星学习通 (Chaoxing)",
    domains: ["chaoxing.com", "edu.cn", "org.cn", "xueyinonline.com"],
  },
  {
    id: "zhs",
    name: "智慧树 (Zhihuishu)",
    domains: ["zhihuishu.com", "studywisdom.com"],
  },
  {
    id: "icve",
    name: "智慧职教 (ICVE)",
    domains: ["icve.com.cn", "courshare.cn", "webtrn.cn"],
  },
  {
    id: "zjy",
    name: "职教云 (Zhijiao Cloud)",
    domains: ["zjy2.icve.com.cn", "zyk.icve.com.cn"],
  },
  {
    id: "icourse",
    name: "中国大学MOOC (iCourse163)",
    domains: ["icourse163.org"],
  },
  {
    id: "yuketang",
    name: "雨课堂 (YuKeTang)",
    domains: ["yuketang.cn"],
  },
];

export class PlatformDetector {
  private platforms: PlatformDef[];

  constructor() {
    this.platforms = PLATFORMS;
  }

  detect(url: string): PlatformInfo | null {
    try {
      const hostname = new URL(url).hostname.toLowerCase();
      for (const platform of this.platforms) {
        if (platform.domains.some((d) => hostname.endsWith(d))) {
          return {
            id: platform.id,
            name: platform.name,
            domains: platform.domains,
            detected: true,
          };
        }
      }
    } catch {
      // invalid URL
    }
    return null;
  }

  listPlatforms(): PlatformInfo[] {
    return this.platforms.map((p) => ({
      id: p.id,
      name: p.name,
      domains: p.domains,
      detected: false,
    }));
  }

  getPlatformById(id: string): PlatformInfo | null {
    const p = this.platforms.find((pl) => pl.id === id);
    if (!p) return null;
    return { id: p.id, name: p.name, domains: p.domains, detected: false };
  }
}
