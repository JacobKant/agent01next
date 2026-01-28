# CLAUDE.md

This file provides guidance to Claude Code (claude.ai/code) when working with code in this repository.

## Project Overview

Agent01Next is an intelligent AI chat platform built with Next.js 14 that provides multi-provider LLM support, extensible functionality through MCP (Model Context Protocol), RAG (Retrieval-Augmented Generation), and scheduled task automation.

## Development Commands

```bash
# Development
npm run dev              # Start Next.js dev server (http://localhost:3000)
npm run build            # Production build
npm run start            # Start production server
npm run lint             # Run ESLint

# MCP Server (for testing)
npm run mcp:server       # Run standalone MCP server

# PR Review
npm run pr-review        # Run automated PR review script
```

## Key Architecture Patterns

### MCP Client Architecture (src/lib/mcp-client.ts)

The `McpClientManager` class manages multiple MCP servers:
- **Singleton pattern** for connection management across servers
- Each server is registered in the `servers` array with either:
  - `serverPath` for local TypeScript servers (executed via `npx tsx`)
  - `command` + `args` for npm package servers
- **Tool routing**: `toolToServerMap` tracks which server provides which tool
- Tools are converted from MCP format to OpenAI function calling format

**Adding a new MCP server:**
1. Create server in `src/mcp/your-server.ts`
2. Register in `McpClientManager.servers` array in `src/lib/mcp-client.ts`
3. Document in `doc/MCP_SERVERS.md`

### Chat Execution Flow (src/lib/chat-executor.ts)

The `executeChatWithMCP()` function implements an iterative tool calling pattern:
1. Send messages to LLM with available tools
2. If response contains `tool_calls`, execute them via MCP
3. Append tool results as `role: "tool"` messages
4. Repeat until no more tool calls (max 10 iterations)
5. Return final message with accumulated token usage

**Important:** Models without tool support (e.g., `google/gemini-2.0-flash-lite-001`) automatically skip MCP connection.

### Assistant Roles System (src/lib/system-prompts.ts)

Four specialized roles with distinct system prompts:
- **default**: Universal assistant
- **team-assistant**: Project management via GitHub Issues, uses RAG for context
- **data-analyst**: Local data analysis (CSV/JSON/logs) via data-analyst-server
- **personal-assistant**: Personalized helper using `personal-profile.txt`

Role selection affects:
- System prompt via `getSystemPrompt(role)`
- Available MCP servers (configured in `mcp-client.ts`)
- Tool availability for the session

### Database Architecture (src/lib/db.ts)

SQLite database (`data/chats.db`) with two main tables:
- **chats**: Chat sessions with metadata (role, title, timestamps)
- **messages**: Individual messages with `tool_calls` and `executed_tools` as JSON

**Important patterns:**
- WAL mode enabled for better concurrency
- All DB operations centralized in `db.ts`
- Use prepared statements (already implemented)

### Scheduler System (src/lib/scheduler.ts)

Cron-based task scheduler initialized via `src/instrumentation.ts`:
- Tasks defined in `src/lib/tasks/` as `ScheduledTask` objects
- Registered in `src/lib/scheduler-init.ts`
- Automatically started when Next.js server initializes

**Adding scheduled tasks:**
1. Create task in `src/lib/tasks/your-task.ts`
2. Export `ScheduledTask` object with `id`, `name`, `cronExpression`, `execute`
3. Import and register in `src/lib/scheduler-init.ts`

## Environment Variables

Required variables (copy from `env.local.example`):
```bash
OPENROUTER_API_KEY=sk-or-...        # Required for LLM API
TELEGRAM_BOT_TOKEN=...              # Optional: For notifications
GITHUB_TOKEN=ghp_...                # Required for team-assistant role
GITHUB_OWNER=username               # Auto-detected from git remote
GITHUB_REPO=repo-name               # Auto-detected from git remote
```

## Critical Integration Points

### 1. LLM Provider System

The project uses OpenRouter as the primary LLM provider:
- `openrouter.ts`: OpenRouter API integration, supports tool calling
- Used by `chat-executor.ts` for all LLM interactions
- Supports custom API endpoints via the "custom" provider option

### 2. RAG System

**Indexing** (document_indexer/ subdirectory):
- Run `npm install` in `document_indexer/` first
- `npm run index` to index documents from `document_indexer/docs/`
- Creates `vectra_index/` vector database
- Uses OpenRouter API for embeddings

**Search** (src/mcp/rag-server.ts):
- MCP server provides `search_rag` tool
- Queries `vectra_index/` for semantic search
- Used by team-assistant role for project context

### 3. Personal Profile System

- User creates `personal-profile.txt` in project root (gitignored)
- Loaded by `src/lib/personal-profile.ts`
- Automatically injected into personal-assistant system prompt
- Provides personalization context (preferences, goals, work style)

## File Structure Guide

```
src/
├── app/                        # Next.js App Router
│   ├── api/                   # API routes
│   │   ├── chat/             # Chat endpoints (main, history, sessions)
│   │   ├── data/             # Data analyst file upload/list
│   │   └── scheduler/        # Scheduler control
│   ├── page.tsx              # Main chat UI
│   └── layout.tsx            # Root layout
├── lib/                       # Core business logic
│   ├── mcp-client.ts         # MCP connection manager
│   ├── chat-executor.ts      # LLM + tool calling loop
│   ├── openrouter.ts         # OpenRouter API integration
│   ├── system-prompts.ts     # Role-based system prompts
│   ├── db.ts                 # SQLite database operations
│   ├── scheduler.ts          # Cron task scheduler
│   ├── embeddings.ts         # Vector embedding generation
│   └── tasks/                # Scheduled task definitions
├── mcp/                       # MCP server implementations
│   ├── server.ts             # CBR currency rates
│   ├── web-server.ts         # Web search/fetch
│   ├── file-server.ts        # File system operations
│   ├── rag-server.ts         # RAG semantic search
│   ├── git-server.ts         # Git operations
│   ├── github-issues-server.ts  # GitHub Issues management
│   └── data-analyst-server.ts   # Data analysis tools
├── types/
│   └── chat.ts               # TypeScript type definitions
└── instrumentation.ts         # Next.js initialization hook (starts scheduler)
```

## Common Development Patterns

### Error Handling in MCP

MCP servers may fail independently. The system continues with remaining servers:
```typescript
// In mcp-client.ts connect()
for (const serverConfig of this.servers) {
  try {
    // ... connect to server
  } catch (error) {
    console.error(`Failed to connect to ${serverConfig.name}`);
    // Continue to next server
  }
}
```

### Tool Call Format

Tools must match OpenAI function calling format:
```typescript
{
  type: "function",
  function: {
    name: "tool_name",
    description: "Tool description",
    parameters: {
      type: "object",
      properties: { /* ... */ },
      required: [ /* ... */ ]
    }
  }
}
```

### Message Format for Tool Results

Tool results use special message format:
```typescript
{
  role: "tool",
  tool_call_id: "call_xxx",  // Must match tool_call.id
  content: "result string"    // Tool execution result
}
```

## Testing Considerations

- MCP servers run as separate processes (stdio transport)
- Test servers independently using `npm run mcp:server`
- Mock `McpClientManager` for unit tests of chat-executor
- Database tests should use separate test DB file
- Consider mocking OpenRouter API in tests

## Subprojects

### android_stores_publisher/
Independent Next.js app for Android store publishing (RuStore, etc.). Not related to main agent01next functionality.

### document_indexer/
RAG indexing utility with separate package.json. Run indexing here, consumed by main app via rag-server.ts.
