import { describe, expect, it } from 'vitest';
import { createAgentRegistry } from '../create-registry.js';
import {
  AGENT_TOOL_PATH_PREFIX,
  GATEWAY_SECURITY_SCHEME,
  buildOpenApiDocument,
} from './openapi-document.js';

const registry = createAgentRegistry({ destructiveToolsEnabled: false });
const tools = registry.listExposed();
const document = buildOpenApiDocument({ tools, serverUrl: 'http://backend:3001' });

describe('buildOpenApiDocument', () => {
  it('lists one path per exposed tool and nothing else', () => {
    expect(Object.keys(document.paths).sort()).toEqual(
      tools.map((tool) => `${AGENT_TOOL_PATH_PREFIX}/${tool.name}`).sort(),
    );
  });

  it('excludes /api/auth, /api/settings and every non-agent path', () => {
    const paths = Object.keys(document.paths);

    expect(paths).not.toContain('/api/auth');
    expect(paths.filter((path) => path.startsWith('/api/auth'))).toEqual([]);
    expect(paths.filter((path) => path.startsWith('/api/settings'))).toEqual([]);
    expect(paths.every((path) => path.startsWith(`${AGENT_TOOL_PATH_PREFIX}/`))).toBe(true);
  });

  it('gives every operation an operationId equal to its tool name', () => {
    for (const tool of tools) {
      const operation = document.paths[`${AGENT_TOOL_PATH_PREFIX}/${tool.name}`]?.post;
      expect(operation?.operationId).toBe(tool.name);
    }
  });

  it('secures every operation with the HTTP bearer scheme', () => {
    expect(document.components.securitySchemes[GATEWAY_SECURITY_SCHEME]).toEqual({
      type: 'http',
      scheme: 'bearer',
    });
    for (const path of Object.values(document.paths)) {
      expect(path.post.security).toEqual([{ [GATEWAY_SECURITY_SCHEME]: [] }]);
    }
  });

  it('takes the request body from the tool inputSchema and forbids unknown fields', () => {
    const listServers = document.paths[`${AGENT_TOOL_PATH_PREFIX}/list_servers`]?.post;
    const status = document.paths[`${AGENT_TOOL_PATH_PREFIX}/get_server_status`]?.post;

    expect(listServers?.requestBody.content['application/json'].schema).toEqual({
      type: 'object',
      properties: {},
      additionalProperties: false,
    });
    expect(status?.requestBody.content['application/json'].schema).toMatchObject({
      additionalProperties: false,
      required: ['serverConfigId', 'virtualServerId'],
    });
  });

  it('documents the ToolFailure shape on the failure responses', () => {
    const failure = document.components.schemas.ToolFailure;
    const operation = document.paths[`${AGENT_TOOL_PATH_PREFIX}/list_servers`]?.post;

    expect(failure).toMatchObject({
      type: 'object',
      required: ['success', 'error', 'requestId'],
      properties: {
        success: { type: 'boolean', enum: [false] },
        error: {
          type: 'object',
          required: ['code', 'message', 'retryable'],
          properties: {
            code: { type: 'string', enum: expect.arrayContaining(['INVALID_INPUT', 'TOOL_NOT_FOUND']) },
            message: { type: 'string' },
            retryable: { type: 'boolean' },
          },
        },
        requestId: { type: 'string' },
      },
    });
    for (const status of ['400', '401', '403', '404']) {
      expect(operation?.responses[status]?.content['application/json'].schema).toEqual({
        $ref: '#/components/schemas/ToolFailure',
      });
    }
  });
});
