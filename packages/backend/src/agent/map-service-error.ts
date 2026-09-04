import { ZodError } from 'zod';
import { AppError, TSApiError } from '../middleware/error-handler.js';
import { AgentError, type AgentErrorCode } from './agent-error.js';

/**
 * Shared services speak the REST error vocabulary (`AppError`, `TSApiError`)
 * and Zod speaks its own. The gateway speaks tool error codes, so every
 * failure is translated once here instead of in each tool, and an unknown
 * error never carries its original message to the model.
 */
export function mapServiceError(error: unknown): AgentError {
  if (error instanceof AgentError) return error;
  if (error instanceof ZodError) return new AgentError('INVALID_INPUT', formatZodError(error));
  if (error instanceof AppError) return new AgentError(mapAppErrorCode(error), error.message);
  if (error instanceof TSApiError) return new AgentError('TEAMSPEAK_ERROR', error.message);
  return new AgentError('INTERNAL_ERROR', 'An internal error occurred');
}

function mapAppErrorCode(error: AppError): AgentErrorCode {
  if (error.statusCode === 400) return 'INVALID_INPUT';
  if (error.statusCode !== 404) return 'INTERNAL_ERROR';

  const message = error.message.toLowerCase();
  if (message.includes('music bot') || message.includes('bot flow')) return 'BOT_NOT_FOUND';
  if (message.includes('server')) return 'SERVER_NOT_FOUND';
  if (message.includes('client')) return 'CLIENT_NOT_FOUND';
  if (message.includes('channel')) return 'CHANNEL_NOT_FOUND';
  return 'INTERNAL_ERROR';
}

function formatZodError(error: ZodError): string {
  const issue = error.issues[0];
  if (!issue) return 'Invalid input';
  const path = issue.path.join('.');
  return path ? `${path}: ${issue.message}` : issue.message;
}
