import { describe, expect, it } from 'vitest';
import { z } from 'zod';
import type { AgentToolRisk } from './tool-definition.js';
import { defineTool } from './tool-definition.js';
import {
  DESTRUCTIVE_TOOL_NAMES,
  FORBIDDEN_TOOL_NAMES,
  ToolRegistry,
} from './tool-registry.js';

function fakeTool(name: string, risk: AgentToolRisk = 'read') {
  return defineTool({
    name,
    description: `fake ${name}`,
    inputSchema: z.object({}).strict(),
    risk,
    run: async () => ({ success: true as const, action: `${name}_done` }),
  });
}

function registry(destructiveToolsEnabled: boolean): ToolRegistry {
  return new ToolRegistry({ destructiveToolsEnabled });
}

describe('ToolRegistry', () => {
  it('refuses to register any generic command tool name', () => {
    for (const name of FORBIDDEN_TOOL_NAMES) {
      expect(() => registry(true).register(fakeTool(name))).toThrow(/forbidden tool/);
    }
  });

  it('returns undefined for a generic command tool name', () => {
    const tools = registry(true);

    expect(tools.getTool('execute_sql')).toBeUndefined();
    expect(tools.getTool('run_bot_flow')).toBeUndefined();
    expect(tools.listExposed()).toEqual([]);
  });

  it('omits destructive tools from listExposed and getTool while the flag is false', () => {
    const tools = registry(false).register(fakeTool('list_channels'), fakeTool('delete_channel', 'destructive'));

    expect(tools.listExposed().map((tool) => tool.name)).toEqual(['list_channels']);
    expect(tools.getTool('delete_channel')).toBeUndefined();
    expect(tools.getTool('list_channels')?.name).toBe('list_channels');
  });

  it('exposes destructive tools with risk destructive when the flag is true', () => {
    const tools = registry(true).register(fakeTool('delete_channel', 'destructive'));

    expect(tools.listExposed().map((tool) => tool.name)).toEqual(['delete_channel']);
    expect(tools.getTool('delete_channel')?.risk).toBe('destructive');
  });

  it('refuses a destructive-named tool declared with a lower risk', () => {
    for (const name of DESTRUCTIVE_TOOL_NAMES) {
      expect(() => registry(true).register(fakeTool(name, 'write'))).toThrow(/destructive risk/);
    }
  });

  it('refuses a duplicate tool name', () => {
    const tools = registry(true).register(fakeTool('list_channels'));

    expect(() => tools.register(fakeTool('list_channels'))).toThrow(/already registered/);
  });
});
