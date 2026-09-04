export const AGENT_ERROR_CODES = [
  'INVALID_INPUT',
  'UNAUTHENTICATED',
  'FORBIDDEN',
  'SERVER_NOT_FOUND',
  'SERVER_DISCONNECTED',
  'CHANNEL_NOT_FOUND',
  'CLIENT_NOT_FOUND',
  'BOT_NOT_FOUND',
  'CONFLICT',
  'TIMEOUT',
  'TEAMSPEAK_ERROR',
  'INTERNAL_ERROR',
  'TOOL_NOT_FOUND',
] as const;

export type AgentErrorCode = (typeof AGENT_ERROR_CODES)[number];

export interface ToolFailure {
  success: false;
  error: {
    code: AgentErrorCode;
    message: string;
    retryable: boolean;
  };
  requestId: string;
}

const RETRYABLE_CODES = new Set<AgentErrorCode>([
  'TIMEOUT',
  'SERVER_DISCONNECTED',
  'TEAMSPEAK_ERROR',
]);

export class AgentError extends Error {
  constructor(
    readonly code: AgentErrorCode,
    message = 'Tool execution failed',
  ) {
    super(message);
    this.name = 'AgentError';
  }
}

export function toToolError(error: unknown, requestId: string): ToolFailure {
  if (error instanceof AgentError) {
    return {
      success: false,
      error: {
        code: error.code,
        message: error.message,
        retryable: RETRYABLE_CODES.has(error.code),
      },
      requestId,
    };
  }

  return {
    success: false,
    error: {
      code: 'INTERNAL_ERROR',
      message: 'An internal error occurred',
      retryable: false,
    },
    requestId,
  };
}
