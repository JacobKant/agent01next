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

// Интерфейс для описания MCP сервера
interface McpServerConfig {
  name: string;
  serverPath: string;
}

// Класс для управления MCP-клиентами (поддержка нескольких серверов)
export class McpClientManager {
  private clients: Map<string, Client> = new Map();
  private transports: Map<string, StdioClientTransport> = new Map();
  private tools: OpenAITool[] = [];
  private toolToServerMap: Map<string, string> = new Map();

  // Конфигурация MCP серверов
  private servers: McpServerConfig[] = [
    {
      name: "cbr-rates-server",
      serverPath: join(process.cwd(), "src", "mcp", "server.ts"),
    },
    {
      name: "web-fetch-server",
      serverPath: join(process.cwd(), "src", "mcp", "web-server.ts"),
    },
    {
      name: "file-server",
      serverPath: join(process.cwd(), "src", "mcp", "file-server.ts"),
    },
  ];

  async connect(): Promise<OpenAITool[]> {
    if (this.clients.size > 0) {
      return this.tools;
    }

    // Подключаемся к каждому серверу
    for (const serverConfig of this.servers) {
      try {
        const transport = new StdioClientTransport({
          command: "npx",
          args: ["tsx", serverConfig.serverPath],
        });

        const client = new Client({
          name: `api-chat-mcp-client-${serverConfig.name}`,
          version: "1.0.0",
        });

        await client.connect(transport);

        this.clients.set(serverConfig.name, client);
        this.transports.set(serverConfig.name, transport);

        // Получаем список тулов от этого MCP-сервера
        const toolsResult = await client.listTools();

        // Конвертируем MCP-тулы в формат OpenAI
        const serverTools = (toolsResult.tools ?? []).map((tool) => {
          const inputSchema = tool.inputSchema as any;
          
          // Запоминаем какой тул относится к какому серверу
          this.toolToServerMap.set(tool.name, serverConfig.name);
          
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

        this.tools.push(...serverTools);

        console.log(
          `[MCP Client] Подключен к серверу ${serverConfig.name}, тулов: ${serverTools.length}`,
        );
      } catch (error) {
        console.error(
          `[MCP Client] Ошибка при подключении к ${serverConfig.name}:`,
          error,
        );
        // Продолжаем подключаться к другим серверам
      }
    }

    console.log("[MCP Client] Всего доступно тулов:", this.tools.length);
    return this.tools;
  }

  async callTool(name: string, arguments_: Record<string, unknown>): Promise<string> {
    // Определяем к какому серверу относится этот тул
    const serverName = this.toolToServerMap.get(name);
    
    if (!serverName) {
      throw new Error(`Неизвестный тул: ${name}`);
    }

    const client = this.clients.get(serverName);
    
    if (!client) {
      throw new Error(`MCP клиент для сервера ${serverName} не подключен`);
    }

    console.log(`[MCP Client] Вызов тула ${name} на сервере ${serverName} с аргументами:`, arguments_);

    const result = await client.callTool({
      name,
      arguments: arguments_,
    });

    // Извлекаем текстовый контент из результата
    const content = (result.content ?? []) as any[];
    const textItem = content.find(
      (item: any) => item.type === "text" && typeof item.text === "string"
    );

    if (textItem) {
      return textItem.text as string;
    }

    return JSON.stringify(result, null, 2);
  }

  async close(): Promise<void> {
    // Закрываем все клиенты
    const clientEntries = Array.from(this.clients.entries());
    for (const [serverName, client] of clientEntries) {
      try {
        await client.close();
        console.log(`[MCP Client] Закрыт клиент ${serverName}`);
      } catch (error) {
        console.error(`[MCP Client] Ошибка при закрытии клиента ${serverName}:`, error);
      }
    }
    
    this.clients.clear();
    this.transports.clear();
    this.tools = [];
    this.toolToServerMap.clear();
  }
}
