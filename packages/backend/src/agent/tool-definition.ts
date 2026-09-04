import type { z } from 'zod';
import type { AgentContext } from './agent-context.js';
import { mapServiceError } from './map-service-error.js';

/** Spec risk vocabulary: `read` has no side effect, `write` mutates, `destructive` removes. */
export type AgentToolRisk = 'read' | 'write' | 'destructive';

/** A tool's own payload. `requestId` is added by the executor, never by a tool. */
export interface ToolExecutionResult {
  success: true;
  action: string;
  [key: string]: unknown;
}

export interface AgentToolDefinition {
  name: string;
  description: string;
  inputSchema: z.ZodTypeAny;
  outputSchema?: z.ZodTypeAny;
  risk: AgentToolRisk;
  execute(context: AgentContext, input: unknown): Promise<ToolExecutionResult>;
}

export interface ToolSpec<TSchema extends z.ZodTypeAny> {
  name: string;
  description: string;
  inputSchema: TSchema;
  outputSchema?: z.ZodTypeAny;
  risk: AgentToolRisk;
  run(context: AgentContext, input: z.infer<TSchema>): Promise<ToolExecutionResult>;
}

/**
 * Wrap a typed tool body in the erased registry shape. Input is validated
 * against the tool's strict schema before the body runs, and every failure
 * leaves as an `AgentError`, so no service message or stack reaches the model.
 */
export function defineTool<TSchema extends z.ZodTypeAny>(
  spec: ToolSpec<TSchema>,
): AgentToolDefinition {
  return {
    name: spec.name,
    description: spec.description,
    inputSchema: spec.inputSchema,
    outputSchema: spec.outputSchema,
    risk: spec.risk,
    async execute(context, input) {
      const parsed = spec.inputSchema.safeParse(input);
      if (!parsed.success) throw mapServiceError(parsed.error);
      try {
        return await spec.run(context, parsed.data);
      } catch (error) {
        throw mapServiceError(error);
      }
    },
  };
}
