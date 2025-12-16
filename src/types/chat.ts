export type ChatRole = "user" | "assistant" | "system" | "tool";

export type ReasoningDetails = Record<string, unknown>;

export type ToolCall = {
  id: string;
  type: "function";
  function: {
    name: string;
    arguments: string; // JSON string
  };
};

export type ToolResult = {
  role: "tool";
  content: string;
  tool_call_id: string;
};

export type ChatMessage = {
  role: ChatRole;
  content: string | null | Array<{ type: "text" | "tool_use"; text?: string; id?: string; name?: string; input?: Record<string, unknown> }>;
  tool_calls?: ToolCall[];
  tool_call_id?: string; // Для сообщений с role: "tool"
  reasoning_details?: ReasoningDetails;
};

