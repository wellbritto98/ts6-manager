import { describe, expect, it, vi } from 'vitest';
import { createAgentRegistry } from './create-registry.js';
import { DESTRUCTIVE_TOOL_NAMES, FORBIDDEN_TOOL_NAMES } from './tool-registry.js';
import { createToolContext, FAKE_SERVER } from './tools/tool-fakes.js';
import { executeTool } from './tool-executor.js';

function exposedNames(destructiveToolsEnabled: boolean): string[] {
  return createAgentRegistry({ destructiveToolsEnabled }).listExposed().map((tool) => tool.name);
}

describe('createAgentRegistry', () => {
  it('never exposes the spec-forbidden generic command names', () => {
    expect([...FORBIDDEN_TOOL_NAMES]).toEqual([
      'execute_webquery',
      'execute_command',
      'run_teamspeak_command',
      'raw_api_request',
      'execute_sql',
      'run_bot_flow',
    ]);

    const names = exposedNames(true);
    expect(names).not.toContain('execute_webquery');
    expect(names).not.toContain('execute_command');
    expect(names).not.toContain('run_teamspeak_command');
    expect(names).not.toContain('raw_api_request');
    expect(names).not.toContain('execute_sql');
    expect(names).not.toContain('run_bot_flow');
  });

  it('omits the eight destructive tools while the flag is false', () => {
    const names = exposedNames(false);

    for (const destructive of DESTRUCTIVE_TOOL_NAMES) {
      expect(names).not.toContain(destructive);
    }
    expect(names).toContain('list_servers');
    expect(names).toContain('create_channel');
  });

  it('exposes the eight destructive tools with destructive risk when the flag is true', () => {
    const registry = createAgentRegistry({ destructiveToolsEnabled: true });

    for (const destructive of DESTRUCTIVE_TOOL_NAMES) {
      expect(registry.getTool(destructive)?.risk).toBe('destructive');
    }
  });

  it('reports a hidden destructive tool as TOOL_NOT_FOUND without touching TeamSpeak', async () => {
    const registry = createAgentRegistry({ destructiveToolsEnabled: false });
    const execute = vi.fn();
    const context = createToolContext({ execute });

    expect(registry.getTool('delete_channel')).toBeUndefined();
    await expect(executeTool({
      registry,
      context,
      name: 'delete_channel',
      input: { serverConfigId: FAKE_SERVER.id, virtualServerId: 1, cid: 4 },
    })).rejects.toMatchObject({ code: 'TOOL_NOT_FOUND' });
    expect(execute).not.toHaveBeenCalled();
  });

  it('registers every catalog tool under a unique name', () => {
    const names = exposedNames(true);

    expect(new Set(names).size).toBe(names.length);
    expect(names).toEqual(expect.arrayContaining([
      'list_servers',
      'list_channels',
      'list_clients',
      'list_server_groups',
      'list_music_bots',
      'list_bot_flows',
    ]));
  });
});
