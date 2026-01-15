import { McpServer } from "@modelcontextprotocol/sdk/server/mcp.js";
import { StdioServerTransport } from "@modelcontextprotocol/sdk/server/stdio.js";
import { z } from "zod";

// MCP сервер для работы с GitHub Issues
const server = new McpServer({
  name: "github-issues-server",
  version: "1.0.0",
});

const GITHUB_TOKEN = process.env.GITHUB_TOKEN;
// Обрабатываем GITHUB_REPOSITORY в формате "owner/repo"
let GITHUB_OWNER = process.env.GITHUB_OWNER;
let GITHUB_REPO = process.env.GITHUB_REPO;
if (process.env.GITHUB_REPOSITORY) {
  const parts = process.env.GITHUB_REPOSITORY.split("/");
  if (parts.length === 2) {
    GITHUB_OWNER = GITHUB_OWNER || parts[0];
    GITHUB_REPO = GITHUB_REPO || parts[1];
  }
}

// Функция для получения информации о репозитории из git remote
async function getRepoInfo(): Promise<{ owner: string; repo: string } | null> {
  try {
    const { exec } = await import("child_process");
    const { promisify } = await import("util");
    const execAsync = promisify(exec);

    const { stdout } = await execAsync("git remote get-url origin");
    const url = stdout.trim();

    // Парсим URL (поддерживаем https:// и git@ форматы)
    const match = url.match(/(?:github\.com[/:]|git@github\.com:)([^/]+)\/([^/]+?)(?:\.git)?$/);
    if (match) {
      return {
        owner: match[1],
        repo: match[2].replace(/\.git$/, ""),
      };
    }
  } catch (error) {
    console.warn("[MCP github-issues-server] Не удалось определить репозиторий из git remote:", error);
  }
  return null;
}

// Функция для выполнения запросов к GitHub API
async function githubRequest(
  endpoint: string,
  options: RequestInit = {}
): Promise<any> {
  if (!GITHUB_TOKEN) {
    throw new Error(
      "GITHUB_TOKEN не найден в переменных окружения. Добавьте токен в .env.local"
    );
  }

  let owner = GITHUB_OWNER;
  let repo = GITHUB_REPO;

  if (!owner || !repo) {
    // Пытаемся определить из git remote
    const repoInfo = await getRepoInfo();
    if (!repoInfo) {
      throw new Error(
        "Не удалось определить owner и repo. Установите GITHUB_OWNER и GITHUB_REPO или GITHUB_REPOSITORY в .env.local"
      );
    }
    owner = owner || repoInfo.owner;
    repo = repo || repoInfo.repo;
  }

  const url = `https://api.github.com/repos/${owner}/${repo}${endpoint}`;

  const response = await fetch(url, {
    ...options,
    headers: {
      Authorization: `token ${GITHUB_TOKEN}`,
      Accept: "application/vnd.github.v3+json",
      "Content-Type": "application/json",
      ...options.headers,
    },
  });

  if (!response.ok) {
    const errorText = await response.text();
    throw new Error(
      `GitHub API вернул ошибку ${response.status}: ${errorText}`
    );
  }

  return response.json();
}

// Тул для создания Issue
server.tool(
  "github_create_issue",
  {
    title: z.string().describe("Заголовок Issue"),
    body: z.string().optional().describe("Описание Issue (тело)"),
    labels: z.array(z.string()).optional().describe("Метки для Issue (например, ['bug', 'high priority'])"),
    assignees: z.array(z.string()).optional().describe("Логины пользователей для назначения на Issue"),
    milestone: z.number().optional().describe("Номер milestone для привязки Issue"),
  },
  async ({ title, body, labels, assignees, milestone }) => {
    console.log("[MCP github-issues-server] Вызван github_create_issue с параметрами:", {
      title,
      body,
      labels,
      assignees,
      milestone,
    });

    try {
      const issue = await githubRequest("/issues", {
        method: "POST",
        body: JSON.stringify({
          title,
          body: body || "",
          labels: labels || [],
          assignees: assignees || [],
          milestone: milestone || undefined,
        }),
      });

      return {
        content: [
          {
            type: "text" as const,
            text: JSON.stringify(
              {
                success: true,
                issue: {
                  number: issue.number,
                  title: issue.title,
                  body: issue.body,
                  state: issue.state,
                  labels: issue.labels.map((l: any) => l.name),
                  assignees: issue.assignees.map((a: any) => a.login),
                  html_url: issue.html_url,
                  created_at: issue.created_at,
                },
              },
              null,
              2
            ),
          },
        ],
      };
    } catch (error) {
      const errorMessage = error instanceof Error ? error.message : String(error);
      console.error("[MCP github-issues-server] Ошибка при создании Issue:", errorMessage);

      return {
        content: [
          {
            type: "text" as const,
            text: JSON.stringify(
              {
                error: `Ошибка при создании Issue: ${errorMessage}`,
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

// Тул для поиска Issues
server.tool(
  "github_list_issues",
  {
    state: z.enum(["open", "closed", "all"]).optional().describe("Статус Issues (open, closed, all). По умолчанию 'open'"),
    labels: z.string().optional().describe("Фильтр по меткам (например, 'bug,high priority')"),
    assignee: z.string().optional().describe("Фильтр по назначенному пользователю"),
    creator: z.string().optional().describe("Фильтр по создателю Issue"),
    mentioned: z.string().optional().describe("Фильтр по упомянутому пользователю"),
    milestone: z.string().optional().describe("Фильтр по milestone"),
    sort: z.enum(["created", "updated", "comments"]).optional().describe("Сортировка (created, updated, comments)"),
    direction: z.enum(["asc", "desc"]).optional().describe("Направление сортировки (asc, desc)"),
    since: z.string().optional().describe("Фильтр по дате создания (ISO 8601 формат)"),
    per_page: z.number().optional().describe("Количество Issues на странице (максимум 100, по умолчанию 30)"),
    page: z.number().optional().describe("Номер страницы (по умолчанию 1)"),
  },
  async ({
    state = "open",
    labels,
    assignee,
    creator,
    mentioned,
    milestone,
    sort = "created",
    direction = "desc",
    since,
    per_page = 30,
    page = 1,
  }) => {
    console.log("[MCP github-issues-server] Вызван github_list_issues с параметрами:", {
      state,
      labels,
      assignee,
      creator,
      mentioned,
      milestone,
      sort,
      direction,
      since,
      per_page,
      page,
    });

    try {
      const params = new URLSearchParams({
        state,
        sort,
        direction,
        per_page: Math.min(per_page, 100).toString(),
        page: page.toString(),
      });

      if (labels) params.append("labels", labels);
      if (assignee) params.append("assignee", assignee);
      if (creator) params.append("creator", creator);
      if (mentioned) params.append("mentioned", mentioned);
      if (milestone) params.append("milestone", milestone);
      if (since) params.append("since", since);

      const issues = await githubRequest(`/issues?${params.toString()}`);

      const formattedIssues = issues.map((issue: any) => ({
        number: issue.number,
        title: issue.title,
        body: issue.body,
        state: issue.state,
        labels: issue.labels.map((l: any) => ({
          name: l.name,
          color: l.color,
          description: l.description,
        })),
        assignees: issue.assignees.map((a: any) => ({
          login: a.login,
          avatar_url: a.avatar_url,
        })),
        user: {
          login: issue.user.login,
          avatar_url: issue.user.avatar_url,
        },
        created_at: issue.created_at,
        updated_at: issue.updated_at,
        closed_at: issue.closed_at,
        comments: issue.comments,
        html_url: issue.html_url,
        // Определяем приоритет из меток
        priority: issue.labels.find((l: any) => 
          ["high", "medium", "low", "critical", "urgent"].includes(l.name.toLowerCase())
        )?.name || null,
      }));

      return {
        content: [
          {
            type: "text" as const,
            text: JSON.stringify(
              {
                count: formattedIssues.length,
                total: formattedIssues.length, // GitHub API не возвращает общее количество в этом эндпоинте
                issues: formattedIssues,
              },
              null,
              2
            ),
          },
        ],
      };
    } catch (error) {
      const errorMessage = error instanceof Error ? error.message : String(error);
      console.error("[MCP github-issues-server] Ошибка при получении Issues:", errorMessage);

      return {
        content: [
          {
            type: "text" as const,
            text: JSON.stringify(
              {
                error: `Ошибка при получении Issues: ${errorMessage}`,
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

// Тул для получения конкретного Issue
server.tool(
  "github_get_issue",
  {
    issue_number: z.number().describe("Номер Issue"),
  },
  async ({ issue_number }) => {
    console.log("[MCP github-issues-server] Вызван github_get_issue с параметрами:", {
      issue_number,
    });

    try {
      const issue = await githubRequest(`/issues/${issue_number}`);

      return {
        content: [
          {
            type: "text" as const,
            text: JSON.stringify(
              {
                number: issue.number,
                title: issue.title,
                body: issue.body,
                state: issue.state,
                labels: issue.labels.map((l: any) => ({
                  name: l.name,
                  color: l.color,
                  description: l.description,
                })),
                assignees: issue.assignees.map((a: any) => ({
                  login: a.login,
                  avatar_url: a.avatar_url,
                })),
                user: {
                  login: issue.user.login,
                  avatar_url: issue.user.avatar_url,
                },
                created_at: issue.created_at,
                updated_at: issue.updated_at,
                closed_at: issue.closed_at,
                comments: issue.comments,
                html_url: issue.html_url,
                priority: issue.labels.find((l: any) => 
                  ["high", "medium", "low", "critical", "urgent"].includes(l.name.toLowerCase())
                )?.name || null,
              },
              null,
              2
            ),
          },
        ],
      };
    } catch (error) {
      const errorMessage = error instanceof Error ? error.message : String(error);
      console.error("[MCP github-issues-server] Ошибка при получении Issue:", errorMessage);

      return {
        content: [
          {
            type: "text" as const,
            text: JSON.stringify(
              {
                error: `Ошибка при получении Issue: ${errorMessage}`,
                issue_number,
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

// Тул для обновления Issue
server.tool(
  "github_update_issue",
  {
    issue_number: z.number().describe("Номер Issue для обновления"),
    title: z.string().optional().describe("Новый заголовок Issue"),
    body: z.string().optional().describe("Новое описание Issue"),
    state: z.enum(["open", "closed"]).optional().describe("Новый статус Issue"),
    labels: z.array(z.string()).optional().describe("Новые метки для Issue"),
    assignees: z.array(z.string()).optional().describe("Новые назначенные пользователи"),
    milestone: z.number().optional().describe("Номер milestone для привязки Issue"),
  },
  async ({ issue_number, title, body, state, labels, assignees, milestone }) => {
    console.log("[MCP github-issues-server] Вызван github_update_issue с параметрами:", {
      issue_number,
      title,
      body,
      state,
      labels,
      assignees,
      milestone,
    });

    try {
      const updateData: any = {};
      if (title !== undefined) updateData.title = title;
      if (body !== undefined) updateData.body = body;
      if (state !== undefined) updateData.state = state;
      if (labels !== undefined) updateData.labels = labels;
      if (assignees !== undefined) updateData.assignees = assignees;
      if (milestone !== undefined) updateData.milestone = milestone;

      const issue = await githubRequest(`/issues/${issue_number}`, {
        method: "PATCH",
        body: JSON.stringify(updateData),
      });

      return {
        content: [
          {
            type: "text" as const,
            text: JSON.stringify(
              {
                success: true,
                issue: {
                  number: issue.number,
                  title: issue.title,
                  body: issue.body,
                  state: issue.state,
                  labels: issue.labels.map((l: any) => l.name),
                  assignees: issue.assignees.map((a: any) => a.login),
                  html_url: issue.html_url,
                  updated_at: issue.updated_at,
                },
              },
              null,
              2
            ),
          },
        ],
      };
    } catch (error) {
      const errorMessage = error instanceof Error ? error.message : String(error);
      console.error("[MCP github-issues-server] Ошибка при обновлении Issue:", errorMessage);

      return {
        content: [
          {
            type: "text" as const,
            text: JSON.stringify(
              {
                error: `Ошибка при обновлении Issue: ${errorMessage}`,
                issue_number,
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
  console.log("[MCP github-issues-server] Старт, ожидание соединения по stdio...");
  
  // Логируем наличие токена (без вывода самого токена)
  const hasToken = !!GITHUB_TOKEN;
  console.log(`[MCP github-issues-server] GITHUB_TOKEN установлен: ${hasToken ? "да" : "нет"}`);
  
  if (!hasToken) {
    console.error("[MCP github-issues-server] ВНИМАНИЕ: GITHUB_TOKEN не найден в переменных окружения!");
    console.error("[MCP github-issues-server] Добавьте ключ в .env.local и перезапустите сервер");
  }
  
  await server.connect(transport);
}

main().catch((error) => {
  console.error("Ошибка при запуске MCP github-issues-сервера:", error);
  process.exit(1);
});
