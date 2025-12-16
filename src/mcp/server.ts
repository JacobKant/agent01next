import { McpServer } from "@modelcontextprotocol/sdk/server/mcp.js";
import { StdioServerTransport } from "@modelcontextprotocol/sdk/server/stdio.js";
import { z } from "zod";

// MCP сервер, предоставляющий доступ к API ЦБ РФ по курсам валют
const server = new McpServer({
  name: "cbr-rates-server",
  version: "1.0.0",
});

// Тул для получения курсов валют с https://www.cbr-xml-daily.ru/daily_json.js
server.tool(
  "cbr_rates",
  {
    code: z
      .string()
      .optional()
      .describe(
        'Код валюты (например, "USD", "EUR"). Если не указан, возвращаются все валюты.',
      ),
  },
  async ({ code }) => {
    console.log("[MCP server] Вызван cbr_rates с code=", code);

    const response = await fetch("https://www.cbr-xml-daily.ru/daily_json.js");

    if (!response.ok) {
      throw new Error(
        `Ошибка при запросе к ЦБ РФ: ${response.status} ${response.statusText}`,
      );
    }

    const data = (await response.json()) as any;

    let result: unknown;

    if (code) {
      const upper = code.toUpperCase();
      const valute = data.Valute?.[upper];

      if (!valute) {
        result = {
          error: `Валюта с кодом "${upper}" не найдена в ответе ЦБ РФ`,
          availableCodes: Object.keys(data.Valute ?? {}),
        };
      } else {
        result = {
          Date: data.Date,
          PreviousDate: data.PreviousDate,
          Timestamp: data.Timestamp,
          Code: upper,
          Name: valute.Name,
          Nominal: valute.Nominal,
          Value: valute.Value,
          Previous: valute.Previous,
        };
      }
    } else {
      result = {
        Date: data.Date,
        PreviousDate: data.PreviousDate,
        Timestamp: data.Timestamp,
        Valute: data.Valute,
      };
    }

    return {
      content: [
        {
          type: "text" as const,
          text: JSON.stringify(result, null, 2),
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
