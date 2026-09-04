import { zodToJsonSchema, type Targets } from 'zod-to-json-schema';
import type { AgentToolDefinition } from './tool-definition.js';

export type JsonSchema = Record<string, unknown>;

function convert(tool: AgentToolDefinition, target: Targets): JsonSchema {
  const { $schema: _ignored, ...schema } = zodToJsonSchema(tool.inputSchema, {
    target,
    $refStrategy: 'none',
  }) as JsonSchema;

  return schema;
}

/**
 * Both adapters describe the same `.strict()` Zod input, each in the dialect
 * its own spec mandates. `.strict()` surfaces as `additionalProperties: false`;
 * authoritative validation still happens in `defineTool`.
 */
export function toOpenApiInputSchema(tool: AgentToolDefinition): JsonSchema {
  // OpenAPI 3.0 keeps the draft-4 spelling (`exclusiveMinimum: true`).
  return convert(tool, 'openApi3');
}

export function toJsonSchemaInput(tool: AgentToolDefinition): JsonSchema {
  // MCP advertises JSON Schema, where `exclusiveMinimum` carries the number.
  return convert(tool, 'jsonSchema7');
}
