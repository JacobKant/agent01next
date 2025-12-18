import { McpServer } from "@modelcontextprotocol/sdk/server/mcp.js";
import { StdioServerTransport } from "@modelcontextprotocol/sdk/server/stdio.js";
import { z } from "zod";
import { writeFile, readFile, mkdir } from "fs/promises";
import { existsSync } from "fs";
import { join, resolve, relative, dirname } from "path";

// MCP сервер, предоставляющий доступ к файловой системе (только в разрешенной директории)
const server = new McpServer({
  name: "file-server",
  version: "1.0.0",
});

// Разрешенная директория для работы с файлами (относительно корня проекта)
const ALLOWED_DIRECTORY = join(process.cwd(), "data", "files");

// Функция для безопасной проверки пути
function isPathAllowed(filePath: string): boolean {
  try {
    // Разрешаем только относительные пути внутри ALLOWED_DIRECTORY
    const resolvedPath = resolve(ALLOWED_DIRECTORY, filePath);
    const relativePath = relative(ALLOWED_DIRECTORY, resolvedPath);
    
    // Проверяем что путь не выходит за пределы разрешенной директории
    // (не содержит ".." в начале)
    return !relativePath.startsWith("..") && !relativePath.startsWith("/");
  } catch {
    return false;
  }
}

// Функция для получения полного пути к файлу
function getFullPath(filePath: string): string {
  return resolve(ALLOWED_DIRECTORY, filePath);
}

// Тул для сохранения текста в файл
server.tool(
  "save_file",
  {
    filePath: z
      .string()
      .describe("Путь к файлу относительно директории data/files (например, 'documents/note.txt')"),
    content: z.string().describe("Содержимое файла для сохранения"),
    encoding: z
      .enum(["utf8", "utf-8"])
      .optional()
      .describe("Кодировка файла (по умолчанию utf8)"),
  },
  async ({ filePath, content, encoding = "utf8" }) => {
    console.log("[MCP file-server] Вызван save_file с filePath=", filePath);

    try {
      // Проверяем что путь разрешен
      if (!isPathAllowed(filePath)) {
        return {
          content: [
            {
              type: "text" as const,
              text: JSON.stringify(
                {
                  error: "Путь выходит за пределы разрешенной директории",
                  filePath,
                  allowedDirectory: "data/files",
                },
                null,
                2
              ),
            },
          ],
        };
      }

      const fullPath = getFullPath(filePath);
      const dir = dirname(fullPath);

      // Создаем директорию если её нет
      if (!existsSync(dir)) {
        await mkdir(dir, { recursive: true });
        console.log(`[MCP file-server] Создана директория: ${dir}`);
      }

      // Сохраняем файл
      await writeFile(fullPath, content, encoding);

      const result = {
        success: true,
        filePath,
        fullPath: relative(process.cwd(), fullPath),
        size: Buffer.byteLength(content, encoding),
        message: "Файл успешно сохранен",
      };

      console.log(`[MCP file-server] Файл сохранен: ${fullPath}`);

      return {
        content: [
          {
            type: "text" as const,
            text: JSON.stringify(result, null, 2),
          },
        ],
      };
    } catch (error) {
      const errorMessage = error instanceof Error ? error.message : String(error);
      console.error(`[MCP file-server] Ошибка при сохранении файла:`, error);

      return {
        content: [
          {
            type: "text" as const,
            text: JSON.stringify(
              {
                error: `Ошибка при сохранении файла: ${errorMessage}`,
                filePath,
              },
              null,
              2
            ),
          },
        ],
      };
    }
  }
);

// Тул для чтения файла
server.tool(
  "read_file",
  {
    filePath: z
      .string()
      .describe("Путь к файлу относительно директории data/files (например, 'documents/note.txt')"),
    encoding: z
      .enum(["utf8", "utf-8"])
      .optional()
      .describe("Кодировка файла (по умолчанию utf8)"),
  },
  async ({ filePath, encoding = "utf8" }) => {
    console.log("[MCP file-server] Вызван read_file с filePath=", filePath);

    try {
      // Проверяем что путь разрешен
      if (!isPathAllowed(filePath)) {
        return {
          content: [
            {
              type: "text" as const,
              text: JSON.stringify(
                {
                  error: "Путь выходит за пределы разрешенной директории",
                  filePath,
                  allowedDirectory: "data/files",
                },
                null,
                2
              ),
            },
          ],
        };
      }

      const fullPath = getFullPath(filePath);

      // Проверяем что файл существует
      if (!existsSync(fullPath)) {
        return {
          content: [
            {
              type: "text" as const,
              text: JSON.stringify(
                {
                  error: "Файл не найден",
                  filePath,
                  fullPath: relative(process.cwd(), fullPath),
                },
                null,
                2
              ),
            },
          ],
        };
      }

      // Читаем файл
      const content = await readFile(fullPath, encoding);
      const stats = await import("fs/promises").then((m) => m.stat(fullPath));

      const result = {
        success: true,
        filePath,
        fullPath: relative(process.cwd(), fullPath),
        content,
        size: stats.size,
        encoding,
        modified: stats.mtime.toISOString(),
      };

      console.log(`[MCP file-server] Файл прочитан: ${fullPath}`);

      return {
        content: [
          {
            type: "text" as const,
            text: JSON.stringify(result, null, 2),
          },
        ],
      };
    } catch (error) {
      const errorMessage = error instanceof Error ? error.message : String(error);
      console.error(`[MCP file-server] Ошибка при чтении файла:`, error);

      return {
        content: [
          {
            type: "text" as const,
            text: JSON.stringify(
              {
                error: `Ошибка при чтении файла: ${errorMessage}`,
                filePath,
              },
              null,
              2
            ),
          },
        ],
      };
    }
  }
);

// Тул для проверки существования файла
server.tool(
  "file_exists",
  {
    filePath: z
      .string()
      .describe("Путь к файлу относительно директории data/files (например, 'documents/note.txt')"),
  },
  async ({ filePath }) => {
    console.log("[MCP file-server] Вызван file_exists с filePath=", filePath);

    try {
      // Проверяем что путь разрешен
      if (!isPathAllowed(filePath)) {
        return {
          content: [
            {
              type: "text" as const,
              text: JSON.stringify(
                {
                  error: "Путь выходит за пределы разрешенной директории",
                  filePath,
                  allowedDirectory: "data/files",
                },
                null,
                2
              ),
            },
          ],
        };
      }

      const fullPath = getFullPath(filePath);
      const exists = existsSync(fullPath);

      let stats = null;
      if (exists) {
        const fsPromises = await import("fs/promises");
        stats = await fsPromises.stat(fullPath);
      }

      const result = {
        exists,
        filePath,
        fullPath: relative(process.cwd(), fullPath),
        ...(stats && {
          size: stats.size,
          isFile: stats.isFile(),
          isDirectory: stats.isDirectory(),
          modified: stats.mtime.toISOString(),
        }),
      };

      return {
        content: [
          {
            type: "text" as const,
            text: JSON.stringify(result, null, 2),
          },
        ],
      };
    } catch (error) {
      const errorMessage = error instanceof Error ? error.message : String(error);
      console.error(`[MCP file-server] Ошибка при проверке файла:`, error);

      return {
        content: [
          {
            type: "text" as const,
            text: JSON.stringify(
              {
                error: `Ошибка при проверке файла: ${errorMessage}`,
                filePath,
              },
              null,
              2
            ),
          },
        ],
      };
    }
  }
);

async function main() {
  // Создаем разрешенную директорию если её нет
  if (!existsSync(ALLOWED_DIRECTORY)) {
    await mkdir(ALLOWED_DIRECTORY, { recursive: true });
    console.log(`[MCP file-server] Создана разрешенная директория: ${ALLOWED_DIRECTORY}`);
  }

  const transport = new StdioServerTransport();
  console.log("[MCP file-server] Старт, ожидание соединения по stdio...");
  console.log(`[MCP file-server] Разрешенная директория: ${ALLOWED_DIRECTORY}`);
  await server.connect(transport);
}

main().catch((error) => {
  console.error("Ошибка при запуске MCP file-сервера:", error);
  process.exit(1);
});

