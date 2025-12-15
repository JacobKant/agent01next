import { McpServer } from "@modelcontextprotocol/sdk/server/mcp.js";
import { StdioServerTransport } from "@modelcontextprotocol/sdk/server/stdio.js";
import { z } from "zod";

// Простой MCP сервер с тестовым инструментом поиска
const server = new McpServer({
  name: "test-search-server",
  version: "0.1.0",
});

// Минимальный и максимально безопасный инструмент, чтобы исключить ошибки схемы
server.tool(
  "test_search",
  {
    query: z.string().describe("Строка поискового запроса"),
  },
  async ({ query }) => {
    console.log("[MCP server] Вызван test_search с query=", query);

    const results = [
      {
        id: 1,
        title: `Тестовый результат для "${query}"`,
        snippet: `Это простой тестовый результат поиска по запросу "${query}"`,
      },
    ];

    return {
      content: [
        {
          type: "text" as const,
          text: JSON.stringify(
            {
              query,
              total: results.length,
              results,
            },
            null,
            2,
          ),
        },
      ],
    };
  },
);

async function main() {
  const transport = new StdioServerTransport();
  console.log("[MCP server] Старт, ожидание соединения по stdio...");
  await server.connect(transport);
}

main().catch((error) => {
  console.error("Ошибка при запуске MCP сервера:", error);
  process.exit(1);
});
