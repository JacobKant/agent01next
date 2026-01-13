import { McpServer } from "@modelcontextprotocol/sdk/server/mcp.js";
import { StdioServerTransport } from "@modelcontextprotocol/sdk/server/stdio.js";
import { z } from "zod";
import { exec, execFile } from "child_process";
import { promisify } from "util";

const execAsync = promisify(exec);
const execFileAsync = promisify(execFile);

// Вспомогательная функция для выполнения git команд с правильной кодировкой
async function execGitCommand(
  command: string | string[],
  options: { cwd?: string; maxBuffer?: number } = {}
): Promise<{ stdout: string; stderr: string }> {
  // Устанавливаем переменные окружения для правильной кодировки на Windows
  const env = {
    ...process.env,
    LANG: "en_US.UTF-8",
    LC_ALL: "en_US.UTF-8",
    GIT_PAGER: "cat", // Отключаем пейджер
  } as NodeJS.ProcessEnv;

  // Для Windows устанавливаем кодировку через переменные окружения
  if (process.platform === "win32") {
    (env as any).CHCP = "65001"; // UTF-8
    // Также устанавливаем для git
    (env as any).GIT_OPTIONAL_LOCKS = "0";
  }

  try {
    let result;
    
    // Если команда передана как массив, используем execFile
    if (Array.isArray(command)) {
      const [cmd, ...args] = command;
      result = await execFileAsync(cmd, args, {
        cwd: options.cwd || process.cwd(),
        env,
        encoding: "utf8",
        maxBuffer: options.maxBuffer || 10 * 1024 * 1024,
      });
    } else {
      // Если команда передана как строка, используем exec
      result = await execAsync(command, {
        cwd: options.cwd || process.cwd(),
        env,
        encoding: "utf8",
        maxBuffer: options.maxBuffer || 10 * 1024 * 1024,
      });
    }

    return {
      stdout: result.stdout || "",
      stderr: result.stderr || "",
    };
  } catch (error: any) {
    // Обрабатываем ошибки с правильной кодировкой
    const stdout = error?.stdout || "";
    const stderr = error?.stderr || "";
    
    // Если есть stdout, значит команда выполнилась частично успешно
    if (stdout) {
      return { stdout, stderr };
    }

    // Для ошибок git пытаемся извлечь понятное сообщение
    let errorMessage = "";
    if (stderr) {
      // Пытаемся декодировать stderr как UTF-8
      try {
        errorMessage = Buffer.from(stderr, "utf8").toString("utf8");
      } catch {
        errorMessage = stderr;
      }
    } else if (error?.message) {
      errorMessage = error.message;
    } else {
      errorMessage = String(error);
    }

    // Убираем технические детали из сообщения об ошибке
    if (errorMessage.includes("Command failed")) {
      // Извлекаем только основное сообщение об ошибке
      const lines = errorMessage.split("\n");
      const gitErrorLine = lines.find((line) => 
        line.trim() && 
        !line.includes("Command failed") &&
        !line.includes("git log") &&
        !line.includes("git rev-parse")
      );
      if (gitErrorLine) {
        errorMessage = gitErrorLine.trim();
      }
    }

    throw new Error(errorMessage || "Ошибка при выполнении git команды");
  }
}

// MCP сервер, предоставляющий доступ к Git истории коммитов
const server = new McpServer({
  name: "git-server",
  version: "1.0.0",
});

// Тул для просмотра истории коммитов
server.tool(
  "git_log",
  {
    limit: z
      .number()
      .optional()
      .describe("Количество коммитов для отображения (по умолчанию 10, максимум 100)"),
    author: z
      .string()
      .optional()
      .describe("Фильтр по автору коммита (имя или email)"),
    since: z
      .string()
      .optional()
      .describe("Показать коммиты после указанной даты (формат: YYYY-MM-DD или '2 weeks ago')"),
    until: z
      .string()
      .optional()
      .describe("Показать коммиты до указанной даты (формат: YYYY-MM-DD или '1 week ago')"),
    path: z
      .string()
      .optional()
      .describe("Путь к файлу или директории для фильтрации коммитов"),
    search: z
      .string()
      .optional()
      .describe("Поиск коммитов по сообщению коммита (grep)"),
  },
  async ({ limit, author, since, until, path, search }) => {
    console.log("[MCP git-server] Вызван git_log с параметрами:", {
      limit,
      author,
      since,
      until,
      path,
      search,
    });

    try {
      // Формируем команду git log
      const limitValue = Math.min(limit || 10, 100);
      const args: string[] = [
        "git",
        "log",
        `--max-count=${limitValue}`,
        "--pretty=format:%H|%an|%ae|%ad|%s|%b",
        "--date=iso",
      ];

      // Добавляем фильтры
      if (author) {
        args.push(`--author=${author}`);
      }

      if (since) {
        args.push(`--since=${since}`);
      }

      if (until) {
        args.push(`--until=${until}`);
      }

      if (search) {
        args.push(`--grep=${search}`);
      }

      if (path) {
        args.push("--", path);
      }

      console.log(`[MCP git-server] Выполняется команда: git ${args.slice(1).join(" ")}`);

      // Выполняем команду git log с массивом аргументов (более безопасно)
      const { stdout, stderr } = await execGitCommand(args, {
        cwd: process.cwd(),
        maxBuffer: 10 * 1024 * 1024, // 10MB
      });

      if (stderr && !stderr.includes("warning:")) {
        console.warn(`[MCP git-server] Предупреждение: ${stderr}`);
      }

      // Парсим результаты
      const lines = stdout.trim().split("\n").filter((line) => line.trim());

      if (lines.length === 0) {
        return {
          content: [
            {
              type: "text" as const,
              text: JSON.stringify(
                {
                  message: "Коммиты не найдены",
                  filters: { limit, author, since, until, path, search },
                },
                null,
                2
              ),
            },
          ],
        };
      }

      const commits = lines.map((line) => {
        const parts = line.split("|");
        if (parts.length < 5) {
          return null;
        }

        const [hash, authorName, authorEmail, date, subject, ...bodyParts] = parts;
        const body = bodyParts.join("|").trim();

        return {
          hash: hash.substring(0, 7), // Короткий хеш
          fullHash: hash,
          author: {
            name: authorName,
            email: authorEmail,
          },
          date,
          subject,
          body: body || null,
        };
      }).filter((commit) => commit !== null);

      // Получаем дополнительную информацию о каждом коммите (статистику изменений)
      const commitsWithStats = await Promise.all(
        commits.map(async (commit) => {
          try {
            const { stdout: statStdout } = await execGitCommand(
              `git show --stat --format="" ${commit!.fullHash}`,
              {
                cwd: process.cwd(),
                maxBuffer: 1024 * 1024, // 1MB
              }
            );

            const statLines = statStdout.trim().split("\n").filter((line) => line.trim());
            const filesChanged = statLines.length;
            const stats = statLines.map((line) => {
              const match = line.match(/^(.+?)\s+\|\s+(\d+)\s+([+-]+)$/);
              if (match) {
                return {
                  file: match[1].trim(),
                  changes: match[2],
                  diff: match[3],
                };
              }
              return { file: line.trim(), changes: null, diff: null };
            });

            return {
              ...commit,
              stats: {
                filesChanged,
                details: stats,
              },
            };
          } catch (error) {
            console.warn(`[MCP git-server] Не удалось получить статистику для коммита ${commit!.hash}:`, error);
            return {
              ...commit,
              stats: null,
            };
          }
        })
      );

      const result = {
        commitsCount: commitsWithStats.length,
        limit: limitValue,
        filters: {
          author: author || null,
          since: since || null,
          until: until || null,
          path: path || null,
          search: search || null,
        },
        commits: commitsWithStats,
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

      // Проверяем, является ли это ошибкой "не git репозиторий"
      if (errorMessage.includes("not a git repository") || errorMessage.includes("Not a git repository")) {
        return {
          content: [
            {
              type: "text" as const,
              text: JSON.stringify(
                {
                  error: "Текущая директория не является git репозиторием",
                  currentDirectory: process.cwd(),
                },
                null,
                2
              ),
            },
          ],
        };
      }

      console.error(`[MCP git-server] Ошибка при выполнении git log:`, error);

      return {
        content: [
          {
            type: "text" as const,
            text: JSON.stringify(
              {
                error: `Ошибка при получении истории коммитов: ${errorMessage}`,
                filters: { limit, author, since, until, path, search },
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

// Тул для просмотра всех веток
server.tool(
  "git_branches",
  {
    includeRemote: z
      .boolean()
      .optional()
      .describe("Включить удаленные ветки (по умолчанию true)"),
  },
  async ({ includeRemote = true }) => {
    console.log("[MCP git-server] Вызван git_branches с параметрами:", {
      includeRemote,
    });

    try {
      // Получаем текущую ветку
      let currentBranch = "";
      try {
        const { stdout: currentBranchStdout } = await execGitCommand("git rev-parse --abbrev-ref HEAD", {
          cwd: process.cwd(),
        });
        currentBranch = currentBranchStdout.trim();
      } catch (error) {
        console.warn("[MCP git-server] Не удалось определить текущую ветку:", error);
      }

      // Получаем локальные ветки
      const { stdout: localBranchesStdout } = await execGitCommand("git branch", {
        cwd: process.cwd(),
      });

      const localBranches = await Promise.all(
        localBranchesStdout
          .trim()
          .split("\n")
          .filter((line) => line.trim())
          .map(async (line) => {
            const trimmed = line.trim();
            const isCurrent = trimmed.startsWith("*");
            const name = isCurrent ? trimmed.substring(1).trim() : trimmed;

            // Получаем последний коммит для ветки
            let commit = "";
            try {
              const { stdout: commitStdout } = await execGitCommand(`git rev-parse --short ${name}`, {
                cwd: process.cwd(),
              });
              commit = commitStdout.trim();
            } catch (error) {
              console.warn(`[MCP git-server] Не удалось получить коммит для ветки ${name}:`, error);
            }

            return {
              name,
              commit,
              isCurrent: isCurrent || name === currentBranch,
              type: "local" as const,
            };
          })
      );

      let remoteBranches: Array<{
        name: string;
        commit: string;
        isCurrent: boolean;
        type: "remote";
        remote: string;
      }> = [];

      if (includeRemote) {
        try {
          // Получаем удаленные ветки
          const { stdout: remoteBranchesStdout } = await execGitCommand("git branch -r", {
            cwd: process.cwd(),
          });

          remoteBranches = await Promise.all(
            remoteBranchesStdout
              .trim()
              .split("\n")
              .filter((line) => line.trim() && !line.includes("HEAD ->"))
              .map(async (line) => {
                const trimmed = line.trim();
                
                // Разделяем на remote и branch name
                const match = trimmed.match(/^(.+?)\/(.+)$/);
                const remote = match ? match[1] : "";
                const name = match ? match[2] : trimmed;
                const fullName = trimmed;

                // Получаем последний коммит для удаленной ветки
                let commit = "";
                try {
                  const { stdout: commitStdout } = await execGitCommand(`git rev-parse --short ${fullName}`, {
                    cwd: process.cwd(),
                  });
                  commit = commitStdout.trim();
                } catch (error) {
                  console.warn(`[MCP git-server] Не удалось получить коммит для удаленной ветки ${fullName}:`, error);
                }

                return {
                  name,
                  commit,
                  isCurrent: false,
                  type: "remote" as const,
                  remote,
                  fullName,
                };
              })
          );
        } catch (error) {
          console.warn("[MCP git-server] Не удалось получить удаленные ветки:", error);
        }
      }

      const result = {
        currentBranch,
        localBranches: localBranches.length,
        remoteBranches: remoteBranches.length,
        branches: [...localBranches, ...remoteBranches],
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

      if (errorMessage.includes("not a git repository") || errorMessage.includes("Not a git repository")) {
        return {
          content: [
            {
              type: "text" as const,
              text: JSON.stringify(
                {
                  error: "Текущая директория не является git репозиторием",
                  currentDirectory: process.cwd(),
                },
                null,
                2
              ),
            },
          ],
        };
      }

      console.error(`[MCP git-server] Ошибка при получении веток:`, error);

      return {
        content: [
          {
            type: "text" as const,
            text: JSON.stringify(
              {
                error: `Ошибка при получении списка веток: ${errorMessage}`,
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

// Тул для получения текущей ветки
server.tool(
  "git_current_branch",
  {},
  async () => {
    console.log("[MCP git-server] Вызван git_current_branch");

    try {
      // Получаем текущую ветку
      const { stdout: branchStdout } = await execGitCommand("git rev-parse --abbrev-ref HEAD", {
        cwd: process.cwd(),
      });

      const branchName = branchStdout.trim();

      // Получаем дополнительную информацию о текущей ветке
      let commitHash = "";
      let commitMessage = "";
      let commitDate = "";
      let author = "";

      try {
        const { stdout: logStdout } = await execGitCommand(
          "git log -1 --pretty=format:%H|%s|%ad|%an --date=iso",
          {
            cwd: process.cwd(),
          }
        );

        const parts = logStdout.split("|");
        if (parts.length >= 4) {
          commitHash = parts[0]?.substring(0, 7) || "";
          commitMessage = parts[1] || "";
          commitDate = parts[2] || "";
          author = parts[3] || "";
        }
      } catch (error) {
        console.warn("[MCP git-server] Не удалось получить информацию о последнем коммите:", error);
      }

      // Проверяем, есть ли несохраненные изменения
      let hasUncommittedChanges = false;
      let uncommittedFiles: string[] = [];

      try {
        const { stdout: statusStdout } = await execGitCommand("git status --porcelain", {
          cwd: process.cwd(),
        });

        const statusLines = statusStdout.trim().split("\n").filter((line) => line.trim());
        hasUncommittedChanges = statusLines.length > 0;
        uncommittedFiles = statusLines.map((line) => line.trim());
      } catch (error) {
        console.warn("[MCP git-server] Не удалось проверить статус репозитория:", error);
      }

      const result = {
        branch: branchName,
        commit: {
          hash: commitHash,
          message: commitMessage,
          date: commitDate,
          author,
        },
        hasUncommittedChanges,
        uncommittedFiles: hasUncommittedChanges ? uncommittedFiles : [],
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

      if (errorMessage.includes("not a git repository") || errorMessage.includes("Not a git repository")) {
        return {
          content: [
            {
              type: "text" as const,
              text: JSON.stringify(
                {
                  error: "Текущая директория не является git репозиторием",
                  currentDirectory: process.cwd(),
                },
                null,
                2
              ),
            },
          ],
        };
      }

      console.error(`[MCP git-server] Ошибка при получении текущей ветки:`, error);

      return {
        content: [
          {
            type: "text" as const,
            text: JSON.stringify(
              {
                error: `Ошибка при получении текущей ветки: ${errorMessage}`,
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

// Тул для просмотра статуса рабочей директории
server.tool(
  "git_status",
  {
    short: z
      .boolean()
      .optional()
      .describe("Короткий формат вывода (по умолчанию false, показывает детальную информацию)"),
  },
  async ({ short = false }) => {
    console.log("[MCP git-server] Вызван git_status с параметрами:", {
      short,
    });

    try {
      // Получаем текущую ветку
      let currentBranch = "";
      try {
        const { stdout: branchStdout } = await execAsync("git rev-parse --abbrev-ref HEAD", {
          cwd: process.cwd(),
        });
        currentBranch = branchStdout.trim();
      } catch (error) {
        console.warn("[MCP git-server] Не удалось определить текущую ветку:", error);
      }

      // Получаем статус в формате porcelain для парсинга
      const { stdout: statusStdout } = await execAsync("git status --porcelain", {
        cwd: process.cwd(),
      });

      const statusLines = statusStdout.trim().split("\n").filter((line) => line.trim());

      // Парсим статус файлов
      const files: Array<{
        path: string;
        status: string;
        staged: boolean;
        unstaged: boolean;
        type: "modified" | "added" | "deleted" | "renamed" | "copied" | "untracked" | "unmerged";
      }> = [];

      for (const line of statusLines) {
        if (line.length < 3) continue;

        const stagedStatus = line[0];
        const unstagedStatus = line[1];
        const filePath = line.substring(3).trim();

        // Определяем тип изменения
        let type: "modified" | "added" | "deleted" | "renamed" | "copied" | "untracked" | "unmerged" = "modified";
        let status = "";

        if (stagedStatus === " " && unstagedStatus === "?") {
          type = "untracked";
          status = "untracked";
        } else if (stagedStatus === "A") {
          type = "added";
          status = "staged (added)";
        } else if (stagedStatus === "D") {
          type = "deleted";
          status = "staged (deleted)";
        } else if (stagedStatus === "M") {
          type = "modified";
          status = "staged (modified)";
        } else if (stagedStatus === "R") {
          type = "renamed";
          status = "staged (renamed)";
        } else if (stagedStatus === "C") {
          type = "copied";
          status = "staged (copied)";
        } else if (stagedStatus === "U" || unstagedStatus === "U") {
          type = "unmerged";
          status = "unmerged";
        } else if (unstagedStatus === "M") {
          type = "modified";
          status = "unstaged (modified)";
        } else if (unstagedStatus === "D") {
          type = "deleted";
          status = "unstaged (deleted)";
        }

        // Обработка переименованных файлов (формат: "R  old -> new")
        if (stagedStatus === "R" && filePath.includes(" -> ")) {
          const [oldPath, newPath] = filePath.split(" -> ");
          files.push({
            path: newPath.trim(),
            status: `renamed from ${oldPath.trim()}`,
            staged: true,
            unstaged: false,
            type: "renamed",
          });
        } else {
          files.push({
            path: filePath,
            status,
            staged: stagedStatus !== " " && stagedStatus !== "?",
            unstaged: unstagedStatus !== " " && unstagedStatus !== "?",
            type,
          });
        }
      }

      // Группируем файлы по типам
      const grouped = {
        staged: files.filter((f) => f.staged && !f.unstaged),
        unstaged: files.filter((f) => f.unstaged && !f.staged),
        both: files.filter((f) => f.staged && f.unstaged),
        untracked: files.filter((f) => f.type === "untracked"),
        unmerged: files.filter((f) => f.type === "unmerged"),
      };

      // Получаем информацию о ветке (впереди/позади удаленной)
      let ahead = 0;
      let behind = 0;
      let trackingBranch = "";

      try {
        const { stdout: branchInfoStdout } = await execGitCommand(
          `git rev-list --left-right --count ${currentBranch}...@{upstream} 2>&1 || echo "0 0"`,
          {
            cwd: process.cwd(),
          }
        );

        const branchInfoParts = branchInfoStdout.trim().split(/\s+/);
        if (branchInfoParts.length >= 2) {
          behind = parseInt(branchInfoParts[0] || "0", 10);
          ahead = parseInt(branchInfoParts[1] || "0", 10);
        }

        // Получаем имя отслеживаемой ветки
        const { stdout: trackingStdout } = await execGitCommand(
          `git rev-parse --abbrev-ref ${currentBranch}@{upstream} 2>&1 || echo ""`,
          {
            cwd: process.cwd(),
          }
        );
        trackingBranch = trackingStdout.trim() || "";
      } catch (error) {
        // Игнорируем ошибки, если нет отслеживаемой ветки
      }

      const result = {
        branch: currentBranch,
        trackingBranch: trackingBranch || null,
        ahead,
        behind,
        hasChanges: files.length > 0,
        summary: {
          staged: grouped.staged.length,
          unstaged: grouped.unstaged.length,
          both: grouped.both.length,
          untracked: grouped.untracked.length,
          unmerged: grouped.unmerged.length,
          total: files.length,
        },
        files: short
          ? files.map((f) => ({
              path: f.path,
              status: f.status,
            }))
          : files,
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

      if (errorMessage.includes("not a git repository") || errorMessage.includes("Not a git repository")) {
        return {
          content: [
            {
              type: "text" as const,
              text: JSON.stringify(
                {
                  error: "Текущая директория не является git репозиторием",
                  currentDirectory: process.cwd(),
                },
                null,
                2
              ),
            },
          ],
        };
      }

      console.error(`[MCP git-server] Ошибка при получении статуса:`, error);

      return {
        content: [
          {
            type: "text" as const,
            text: JSON.stringify(
              {
                error: `Ошибка при получении статуса репозитория: ${errorMessage}`,
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

// Тул для получения diff между ветками или коммитами
server.tool(
  "git_diff",
  {
    base: z
      .string()
      .optional()
      .describe("Базовая ветка или коммит для сравнения (по умолчанию 'main' или 'master')"),
    head: z
      .string()
      .optional()
      .describe("Ветка или коммит с изменениями для сравнения (по умолчанию 'HEAD')"),
    path: z
      .string()
      .optional()
      .describe("Путь к конкретному файлу или директории для ограничения diff"),
    unified: z
      .number()
      .optional()
      .describe("Количество строк контекста вокруг изменений (по умолчанию 3)"),
    stat: z
      .boolean()
      .optional()
      .describe("Показать только статистику изменений (по умолчанию false)"),
  },
  async ({ base, head = "HEAD", path, unified = 3, stat = false }) => {
    console.log("[MCP git-server] Вызван git_diff с параметрами:", {
      base,
      head,
      path,
      unified,
      stat,
    });

    try {
      // Определяем базовую ветку
      let baseBranch = base;
      if (!baseBranch) {
        // Пытаемся определить основную ветку (main или master)
        try {
          const { stdout: mainBranch } = await execGitCommand("git rev-parse --abbrev-ref main", {
            cwd: process.cwd(),
          });
          baseBranch = mainBranch.trim() || "main";
        } catch {
          try {
            const { stdout: masterBranch } = await execGitCommand("git rev-parse --abbrev-ref master", {
              cwd: process.cwd(),
            });
            baseBranch = masterBranch.trim() || "master";
          } catch {
            baseBranch = "main";
          }
        }
      }

      // Получаем статистику изменений
      const statArgs: string[] = [
        "git",
        "diff",
        `--unified=${unified}`,
        "--stat",
        `${baseBranch}...${head}`,
      ];

      if (path) {
        statArgs.push("--", path);
      }

      const { stdout: statStdout, stderr: statStderr } = await execGitCommand(statArgs, {
        cwd: process.cwd(),
        maxBuffer: 10 * 1024 * 1024, // 10MB
      });

      if (statStderr && !statStderr.includes("warning:")) {
        console.warn(`[MCP git-server] Предупреждение при получении статистики: ${statStderr}`);
      }

      // Если запрошена только статистика
      if (stat) {
        return {
          content: [
            {
              type: "text" as const,
              text: JSON.stringify(
                {
                  base: baseBranch,
                  head,
                  path: path || null,
                  stat: statStdout,
                },
                null,
                2
              ),
            },
          ],
        };
      }

      // Получаем полный diff
      const diffArgs: string[] = [
        "git",
        "diff",
        `--unified=${unified}`,
        `${baseBranch}...${head}`,
      ];

      if (path) {
        diffArgs.push("--", path);
      }

      const { stdout: diffStdout, stderr: diffStderr } = await execGitCommand(diffArgs, {
        cwd: process.cwd(),
        maxBuffer: 10 * 1024 * 1024, // 10MB
      });

      if (diffStderr && !diffStderr.includes("warning:")) {
        console.warn(`[MCP git-server] Предупреждение при получении diff: ${diffStderr}`);
      }

      // Получаем список измененных файлов
      const filesArgs: string[] = [
        "git",
        "diff",
        "--name-status",
        `${baseBranch}...${head}`,
      ];

      if (path) {
        filesArgs.push("--", path);
      }

      const { stdout: filesStdout } = await execGitCommand(filesArgs, {
        cwd: process.cwd(),
      });

      const changedFiles = filesStdout
        .trim()
        .split("\n")
        .filter((line) => line.trim())
        .map((line) => {
          const match = line.match(/^([AMD])\s+(.+)$/);
          if (match) {
            return {
              status: match[1], // A=Added, M=Modified, D=Deleted
              file: match[2],
            };
          }
          return {
            status: "?",
            file: line.trim(),
          };
        });

      // Получаем информацию о коммитах в диапазоне
      const { stdout: commitsStdout } = await execGitCommand(
        `git log --oneline ${baseBranch}..${head}`,
        {
          cwd: process.cwd(),
        }
      );

      const commits = commitsStdout
        .trim()
        .split("\n")
        .filter((line) => line.trim())
        .map((line) => {
          const match = line.match(/^([a-f0-9]+)\s+(.+)$/);
          if (match) {
            return {
              hash: match[1],
              message: match[2],
            };
          }
          return {
            hash: line.substring(0, 7),
            message: line.substring(8),
          };
        });

      const result = {
        base: baseBranch,
        head,
        path: path || null,
        commitsCount: commits.length,
        commits,
        filesCount: changedFiles.length,
        files: changedFiles,
        stat: statStdout,
        diff: diffStdout,
        summary: {
          added: changedFiles.filter((f) => f.status === "A").length,
          modified: changedFiles.filter((f) => f.status === "M").length,
          deleted: changedFiles.filter((f) => f.status === "D").length,
        },
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

      if (errorMessage.includes("not a git repository") || errorMessage.includes("Not a git repository")) {
        return {
          content: [
            {
              type: "text" as const,
              text: JSON.stringify(
                {
                  error: "Текущая директория не является git репозиторием",
                  currentDirectory: process.cwd(),
                },
                null,
                2
              ),
            },
          ],
        };
      }

      console.error(`[MCP git-server] Ошибка при получении diff:`, error);

      return {
        content: [
          {
            type: "text" as const,
            text: JSON.stringify(
              {
                error: `Ошибка при получении diff: ${errorMessage}`,
                base,
                head,
                path: path || null,
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
  const transport = new StdioServerTransport();
  console.log("[MCP git-server] Старт, ожидание соединения по stdio...");
  console.log(`[MCP git-server] Рабочая директория: ${process.cwd()}`);
  await server.connect(transport);
}

main().catch((error) => {
  console.error("Ошибка при запуске MCP git-сервера:", error);
  process.exit(1);
});
