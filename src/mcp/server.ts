import { BrowserController } from "../browser/controller.js";
import { createMCPTools } from "./tools.js";

/**
 * MCP Server — 通过 stdio 与 AI Agent 通信
 * 使用方式: node mcp-server.js (在 agent 的 MCP 配置中指定)
 *
 * 支持 JSON-RPC 2.0 协议（MCP 标准）
 */
export async function startMCPServer() {
  const controller = new BrowserController();
  const { tools } = createMCPTools(controller);

  const toolMap = new Map(tools.map((t) => [t.name, t]));

  let buffer = "";

  process.stdin.setEncoding("utf-8");
  process.stdin.on("data", async (chunk: string) => {
    buffer += chunk;
    const lines = buffer.split("\n");
    buffer = lines.pop() ?? "";

    for (const line of lines) {
      if (!line.trim()) continue;
      try {
        const request = JSON.parse(line);
        const response = await handleRequest(request, toolMap);
        process.stdout.write(JSON.stringify(response) + "\n");
      } catch (e: any) {
        process.stdout.write(
          JSON.stringify({
            jsonrpc: "2.0",
            id: null,
            error: { code: -32700, message: "Parse error: " + e.message },
          }) + "\n"
        );
      }
    }
  });

  process.stderr.write("OCS-CLI MCP Server 已启动\n");
}

async function handleRequest(
  request: any,
  toolMap: Map<string, any>
): Promise<any> {
  const { id, method, params } = request;

  switch (method) {
    case "initialize":
      return {
        jsonrpc: "2.0",
        id,
        result: {
          protocolVersion: "2024-11-05",
          capabilities: { tools: {} },
          serverInfo: { name: "ocs-cli", version: "0.1.0" },
        },
      };

    case "tools/list":
      return {
        jsonrpc: "2.0",
        id,
        result: {
          tools: Array.from(toolMap.values()).map((t) => ({
            name: t.name,
            description: t.description,
            inputSchema: t.inputSchema,
          })),
        },
      };

    case "tools/call": {
      const tool = toolMap.get(params?.name);
      if (!tool) {
        return {
          jsonrpc: "2.0",
          id,
          error: { code: -32601, message: `Tool not found: ${params?.name}` },
        };
      }
      try {
        const result = await tool.handler(params?.arguments ?? {});
        return {
          jsonrpc: "2.0",
          id,
          result: { content: [{ type: "text", text: result }] },
        };
      } catch (e: any) {
        return {
          jsonrpc: "2.0",
          id,
          result: {
            content: [{ type: "text", text: `错误: ${e.message}` }],
            isError: true,
          },
        };
      }
    }

    default:
      return {
        jsonrpc: "2.0",
        id,
        error: { code: -32601, message: `Unknown method: ${method}` },
      };
  }
}
