export type ChatRole = "user" | "assistant" | "system";

export type ReasoningDetails = Record<string, unknown>;

export type ChatMessage = {
  role: ChatRole;
  content: string;
  reasoning_details?: ReasoningDetails;
};

