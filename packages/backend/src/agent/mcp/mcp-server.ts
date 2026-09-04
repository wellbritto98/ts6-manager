import { randomUUID } from 'node:crypto';
import {
  McpServer,
  fromJsonSchema,
  type CallToolResult,
  type StandardSchemaWithJSON,
} from '@modelcontextprotocol/server';
import type { AgentContext } from '../agent-context.js';
import { toToolError } from '../agent-error.js';
import type { AgentToolDefinition } from '../tool-definition.js';
import { toJsonSchemaInput } from '../tool-input-schema.js';
import { executeTool } from '../tool-executor.js';
import type { AgentToolCatalog } from '../openapi/openapi.routes.js';

export interface McpServerDeps {
  registry: AgentToolCatalog;
  /** Built once per authenticated HTTP request, before the transport runs. */
  createContext: () => AgentContext;
}

export interface McpToolRegistration {
  name: string;
  config: {
    description: string;
    inputSchema: StandardSchemaWithJSON;
  };
  handler: (args: unknown) => Promise<CallToolResult>;
}

/**
 * The advertised schema is only a description of the shape. Authoritative
 * validation stays in `defineTool`, so the model cannot reach a tool body
 * through a looser MCP schema than the OpenAPI adapter enforces.
 */
function toMcpInputSchema(tool: AgentToolDefinition): StandardSchemaWithJSON {
  return fromJsonSchema(toJsonSchemaInput(tool));
}

function toContent(payload: unknown, isError: boolean): CallToolResult {
  return {
    content: [{ type: 'text', text: JSON.stringify(payload) }],
    isError,
  };
}

function toHandler(tool: AgentToolDefinition, deps: McpServerDeps) {
  return async (args: unknown): Promise<CallToolResult> => {
    const requestId = randomUUID();
    try {
      const result = await executeTool({
        registry: deps.registry,
        context: deps.createContext(),
        name: tool.name,
        input: args,
      });
      return toContent(result, false);
    } catch (error) {
      return toContent(toToolError(error, requestId), true);
    }
  };
}

/**
 * Exactly the tools `listExposed()` returns: forbidden names were never
 * registered, and a hidden destructive tool is not advertised over MCP either.
 */
export function buildMcpToolRegistrations(deps: McpServerDeps): McpToolRegistration[] {
  return deps.registry.listExposed().map((tool) => ({
    name: tool.name,
    config: { description: tool.description, inputSchema: toMcpInputSchema(tool) },
    handler: toHandler(tool, deps),
  }));
}

/** Stateless by design: the caller builds one server per request. */
export function createTs6McpServer(deps: McpServerDeps): McpServer {
  const server = new McpServer({ name: 'ts6-manager', version: '1.0.0' });
  for (const registration of buildMcpToolRegistrations(deps)) {
    server.registerTool(registration.name, registration.config, registration.handler);
  }

  return server;
}
