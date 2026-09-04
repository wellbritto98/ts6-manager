import { AGENT_ERROR_CODES } from '../agent-error.js';
import type { AgentToolDefinition } from '../tool-definition.js';
import { toOpenApiInputSchema, type JsonSchema } from '../tool-input-schema.js';

/** One path per tool, so `operationId` stays stable for Open WebUI imports. */
export const AGENT_TOOL_PATH_PREFIX = '/api/agent/tools';

/** The only security scheme in the document: the `AI_GATEWAY_TOKEN` bearer. */
export const GATEWAY_SECURITY_SCHEME = 'gatewayBearer';

export type { JsonSchema };

export interface OpenApiMediaType {
  schema: JsonSchema;
}

export interface OpenApiResponse {
  description: string;
  content: { 'application/json': OpenApiMediaType };
}

export interface OpenApiOperation {
  operationId: string;
  description: string;
  tags: string[];
  security: Array<Record<string, string[]>>;
  requestBody: { required: boolean; content: { 'application/json': OpenApiMediaType } };
  responses: Record<string, OpenApiResponse>;
}

export interface OpenApiDocument {
  openapi: string;
  info: { title: string; version: string; description: string };
  servers: Array<{ url: string }>;
  security: Array<Record<string, string[]>>;
  paths: Record<string, { post: OpenApiOperation }>;
  components: {
    securitySchemes: Record<string, { type: string; scheme: string }>;
    schemas: Record<string, JsonSchema>;
  };
}

export interface BuildOpenApiDocumentOptions {
  /** Exposed tools only: pass `registry.listExposed()`, never the raw catalog. */
  tools: AgentToolDefinition[];
  /** Base URL the tool server is reachable at, e.g. `http://backend:3001`. */
  serverUrl?: string;
  version?: string;
}

const TOOL_FAILURE_SCHEMA: JsonSchema = {
  type: 'object',
  required: ['success', 'error', 'requestId'],
  properties: {
    success: { type: 'boolean', enum: [false] },
    error: {
      type: 'object',
      required: ['code', 'message', 'retryable'],
      properties: {
        code: { type: 'string', enum: [...AGENT_ERROR_CODES] },
        message: { type: 'string' },
        retryable: { type: 'boolean' },
      },
    },
    requestId: { type: 'string' },
  },
};

const TOOL_SUCCESS_SCHEMA: JsonSchema = {
  type: 'object',
  required: ['success', 'action', 'requestId'],
  properties: {
    success: { type: 'boolean', enum: [true] },
    action: { type: 'string' },
    requestId: { type: 'string' },
  },
  additionalProperties: true,
};

const FAILURE_RESPONSES: ReadonlyArray<[string, string]> = [
  ['400', 'Invalid tool input'],
  ['401', 'Missing or invalid gateway bearer or Open WebUI identity JWT'],
  ['403', 'The caller is not an allowlisted Open WebUI admin'],
  ['404', 'Unknown or unexposed tool'],
  ['200', 'Tool outcome: a success payload, or a structured failure the model can read'],
];

function toResponse(status: string, description: string): OpenApiResponse {
  const schema: JsonSchema = status === '200'
    ? { oneOf: [TOOL_SUCCESS_SCHEMA, { $ref: '#/components/schemas/ToolFailure' }] }
    : { $ref: '#/components/schemas/ToolFailure' };
  return { description, content: { 'application/json': { schema } } };
}

function toOperation(tool: AgentToolDefinition): OpenApiOperation {
  const responses: Record<string, OpenApiResponse> = {};
  for (const [status, description] of FAILURE_RESPONSES) {
    responses[status] = toResponse(status, description);
  }

  return {
    operationId: tool.name,
    description: tool.description,
    tags: ['agent'],
    security: [{ [GATEWAY_SECURITY_SCHEME]: [] }],
    requestBody: {
      required: true,
      content: { 'application/json': { schema: toOpenApiInputSchema(tool) } },
    },
    responses,
  };
}

/**
 * Describe the exposed tool catalog and nothing else. The document is derived
 * from `listExposed()`, so no SPA route ever reaches it and a hidden
 * destructive tool is not advertised.
 */
export function buildOpenApiDocument({
  tools,
  serverUrl = '/',
  version = '1.0.0',
}: BuildOpenApiDocumentOptions): OpenApiDocument {
  const paths: Record<string, { post: OpenApiOperation }> = {};
  for (const tool of tools) {
    paths[`${AGENT_TOOL_PATH_PREFIX}/${tool.name}`] = { post: toOperation(tool) };
  }

  return {
    openapi: '3.0.3',
    info: {
      title: 'TS6 Manager Agent Tools',
      version,
      description:
        'Named TeamSpeak administration tools. Call list_servers first to learn the serverConfigId and virtualServerId every other tool requires.',
    },
    servers: [{ url: serverUrl }],
    security: [{ [GATEWAY_SECURITY_SCHEME]: [] }],
    paths,
    components: {
      securitySchemes: { [GATEWAY_SECURITY_SCHEME]: { type: 'http', scheme: 'bearer' } },
      schemas: { ToolFailure: TOOL_FAILURE_SCHEMA },
    },
  };
}
