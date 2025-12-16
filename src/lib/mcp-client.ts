import { Client } from "@modelcontextprotocol/sdk/client/index.js";
import { StdioClientTransport } from "@modelcontextprotocol/sdk/client/stdio.js";
import { join } from "path";

// Тип для OpenAI-совместимого тула
export type OpenAITool = {
  type: "function";
  function: {
    name: string;
    description?: string;
    parameters?: Record<string, unknown>;
  };
};

// Класс для управления MCP-клиентом
export class McpClientManager {
  private client: Client | null = null;
  private transport: StdioClientTransport | null = null;
  private tools: OpenAITool[] = [];

  async connect(): Promise<OpenAITool[]> {
    if (this.client) {
      return this.tools;
    }

    // Путь к серверу относительно корня проекта
    const serverPath = join(process.cwd(), "src", "mcp", "server.ts");

    this.transport = new StdioClientTransport({
      command: "npx",
      args: ["tsx", serverPath],
    });

    this.client = new Client({
      name: "api-chat-mcp-client",
      version: "1.0.0",
    });

    await this.client.connect(this.transport);

    // Получаем список тулов от MCP-сервера
    const toolsResult = await this.client.listTools();

    // Конвертируем MCP-тулы в формат OpenAI
    this.tools = (toolsResult.tools ?? []).map((tool) => {
      const inputSchema = tool.inputSchema as any;
      return {
        type: "function" as const,
        function: {
          name: tool.name,
          description: tool.description ?? "",
          parameters: {
            type: inputSchema?.type ?? "object",
            properties: inputSchema?.properties ?? {},
            required: inputSchema?.required ?? [],
          },
        },
      };
    });

    console.log("[MCP Client] Подключен к серверу, доступно тулов:", this.tools.length);
    return this.tools;
  }

  async callTool(name: string, arguments_: Record<string, unknown>): Promise<string> {
    if (!this.client) {
      throw new Error("MCP клиент не подключен");
    }

    console.log(`[MCP Client] Вызов тула ${name} с аргументами:`, arguments_);

    const result = await this.client.callTool({
      name,
      arguments: arguments_,
    });

    // Извлекаем текстовый контент из результата
    const textItem = (result.content ?? []).find(
      (item: any) => item.type === "text" && typeof item.text === "string"
    );

    if (textItem) {
      return textItem.text as string;
    }

    return JSON.stringify(result, null, 2);
  }

  async close(): Promise<void> {
    if (this.client) {
      try {
        await this.client.close();
      } catch (error) {
        console.error("[MCP Client] Ошибка при закрытии:", error);
      }
      this.client = null;
      this.transport = null;
    }
  }
}
