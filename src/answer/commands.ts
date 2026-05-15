/**
 * CLI 命令: ocs answer
 */
import type { Command } from "commander";
import type { AnswerService } from "../answer/service.js";

export function registerAnswerCommands(program: Command, answerService: AnswerService, ensureConnected: () => Promise<boolean>, out: (data: any) => void) {
  const answer = program.command("answer").description("答案服务管理");

  answer
    .command("start")
    .description("启动答案服务")
    .option("-p, --port <port>", "服务端口", "17901")
    .action(async (opts: any) => {
      answerService.updateConfig({ port: Number(opts.port) });
      const port = await answerService.start();
      console.log(`答案服务已启动: http://127.0.0.1:${port}`);
      console.log(`ocsjs answererWrapper URL: http://127.0.0.1:${port}/query`);
      console.log("按 Ctrl+C 停止");
      process.on("SIGINT", async () => {
        await answerService.stop();
        process.exit(0);
      });
      await new Promise(() => {});
    });

  answer
    .command("query <question>")
    .description("查询答案")
    .option("-t, --type <type>", "题目类型")
    .action(async (question: string, opts: any) => {
      const result = await answerService.query({ title: question, type: opts.type });
      out(result);
    });

  answer
    .command("queue")
    .description("查看待回答队列")
    .action(() => {
      out({ pending: answerService.getPendingQuestions() });
    });

  answer
    .command("reply <question> <answer>")
    .description("回答队列中的问题（Agent 直答模式）")
    .action((question: string, answerText: string) => {
      answerService.answerQuestion(question, answerText);
      out({ success: true });
    });

  answer
    .command("cache")
    .description("查看答案缓存")
    .action(() => {
      out({ entries: answerService.getCache(), size: answerService.getCache().length });
    });

  answer
    .command("clear-cache")
    .description("清空答案缓存")
    .action(() => {
      answerService.clearCache();
      out({ success: true });
    });

  // 答案配置
  const ansCfg = program.command("answer-config").description("答案源配置");

  ansCfg
    .command("show")
    .description("显示当前配置")
    .action(() => {
      const cfg = answerService.getConfig();
      if (cfg.llm?.apiKey) cfg.llm = { ...cfg.llm, apiKey: "***" } as any;
      out(cfg);
    });

  ansCfg
    .command("tiku")
    .description("添加题库 API")
    .requiredOption("--name <name>", "题库名称")
    .requiredOption("--url <url>", "题库 API URL")
    .option("--method <method>", "请求方法", "POST")
    .option("--handler <fn>", "响应解析函数")
    .action((opts: any) => {
      answerService.addTiku({
        name: opts.name,
        url: opts.url,
        method: opts.method,
        handler: opts.handler,
        enabled: true,
      });
      out({ success: true, message: `题库 ${opts.name} 已添加` });
    });

  ansCfg
    .command("llm")
    .description("配置 LLM API")
    .requiredOption("--api <url>", "API URL")
    .requiredOption("--model <model>", "模型名称")
    .requiredOption("--key <key>", "API Key")
    .option("--prompt <prompt>", "提示词", "你是网课答题助手，根据题目直接给出答案。题目：{question} 选项：{options}")
    .action((opts: any) => {
      answerService.setLLM({
        api: opts.api,
        model: opts.model,
        apiKey: opts.key,
        prompt: opts.prompt,
        temperature: 0.1,
        maxTokens: 200,
      });
      out({ success: true, message: "LLM API 已配置" });
    });

  ansCfg
    .command("mode")
    .description("设置答案模式")
    .option("--tiku-first", "优先题库", true)
    .option("--confidence <n>", "置信度阈值", "0.6")
    .action((opts: any) => {
      answerService.updateConfig({ confidence: Number(opts.confidence) });
      out({ success: true, confidence: Number(opts.confidence) });
    });
}
