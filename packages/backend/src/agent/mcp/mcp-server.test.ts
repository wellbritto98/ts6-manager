import { describe, expect, it } from 'vitest';
import { createAgentRegistry } from '../create-registry.js';
import { createToolContext } from '../tools/tool-fakes.js';
import { buildMcpToolRegistrations, createTs6McpServer, type McpServerDeps } from './mcp-server.js';

function createDeps(destructiveToolsEnabled = false): McpServerDeps {
  return {
    registry: createAgentRegistry({ destructiveToolsEnabled }),
    createContext: () => createToolContext({
      prisma: { aiActionLog: { create: async () => ({}), findUnique: async () => null } },
    }),
  };
}

describe('createTs6McpServer', () => {
  it('registers exactly the tool names listExposed returns', () => {
    const deps = createDeps();

    expect(buildMcpToolRegistrations(deps).map((registration) => registration.name))
      .toEqual(deps.registry.listExposed().map((tool) => tool.name));
  });

  it('never registers run_bot_flow, execute_sql or another generic command name', () => {
    const names = buildMcpToolRegistrations(createDeps(true)).map((registration) => registration.name);

    expect(names).not.toContain('execute_webquery');
    expect(names).not.toContain('execute_command');
    expect(names).not.toContain('run_teamspeak_command');
    expect(names).not.toContain('raw_api_request');
    expect(names).not.toContain('execute_sql');
    expect(names).not.toContain('run_bot_flow');
  });

  it('returns the executeTool payload as MCP text content', async () => {
    const registration = buildMcpToolRegistrations(createDeps())
      .find((candidate) => candidate.name === 'list_servers');

    const result = await registration?.handler({});
    const payload = JSON.parse(String(result?.content?.[0]?.type === 'text' ? result.content[0].text : ''));

    expect(result?.isError).toBe(false);
    expect(payload.success).toBe(true);
    expect(payload.action).toBe('servers_listed');
  });

  it('returns the structured failure as MCP content when input is invalid', async () => {
    const registration = buildMcpToolRegistrations(createDeps())
      .find((candidate) => candidate.name === 'list_servers');

    const result = await registration?.handler({ role: 'admin' });
    const payload = JSON.parse(String(result?.content?.[0]?.type === 'text' ? result.content[0].text : ''));

    expect(result?.isError).toBe(true);
    expect(payload.success).toBe(false);
    expect(payload.error.code).toBe('INVALID_INPUT');
  });

  it('builds a server that accepts every exposed registration', () => {
    expect(() => createTs6McpServer(createDeps(true))).not.toThrow();
  });
});
