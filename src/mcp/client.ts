import { Client } from "@modelcontextprotocol/sdk/client/index.js";
import { StdioClientTransport } from "@modelcontextprotocol/sdk/client/stdio.js";

// Простой MCP client, который поднимает локальный MCP server
// и вызывает его тестовый инструмент поиска

async function main() {
  // Транспорт: запускаем наш MCP server через npx + tsx
  const transport = new StdioClientTransport({
    command: "npx",
    args: ["tsx", "src/mcp/server.ts"],
  });

  const client = new Client({
    name: "local-test-client",
    version: "0.1.0",
  });

  await client.connect(transport);

  // Получим список доступных инструментов
  const tools = await client.listTools();
  console.log("Доступные инструменты MCP сервера:");
  for (const tool of tools.tools ?? []) {
    console.log(`- ${tool.name}: ${tool.description ?? "(без описания)"}`);
  }

  // Вызовем наш тестовый инструмент поиска
  const result = await client.callTool({
    name: "test_search",
    arguments: {
      query: "пример запроса",
    },
  });

  console.log("\nРезультат вызова инструмента test_search:");
  console.dir(result, { depth: null });

  await client.close();
}

main().catch((error) => {
  console.error("Ошибка при работе MCP клиента:", error);
  process.exit(1);
});
