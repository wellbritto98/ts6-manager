import { config } from '../config.js';
import type { AgentToolDefinition } from './tool-definition.js';

/**
 * Generic command surfaces the model must never reach, plus `run_bot_flow`:
 * `BotEngine.executeFlow` is private and has no safe manual entry point.
 */
export const FORBIDDEN_TOOL_NAMES: readonly string[] = [
  'execute_webquery',
  'execute_command',
  'run_teamspeak_command',
  'raw_api_request',
  'execute_sql',
  'run_bot_flow',
];

/** The eight names that stay dark unless `AI_DESTRUCTIVE_TOOLS_ENABLED` is true. */
export const DESTRUCTIVE_TOOL_NAMES: readonly string[] = [
  'delete_channel',
  'kick_client',
  'ban_client',
  'remove_client_from_server_group',
  'remove_channel_permission',
  'stop_music_bot',
  'clear_music_queue',
  'disable_bot_flow',
];

export interface ToolRegistryOptions {
  destructiveToolsEnabled: boolean;
}

export class ToolRegistry {
  private readonly tools = new Map<string, AgentToolDefinition>();

  constructor(private readonly options: ToolRegistryOptions) {}

  register(...tools: AgentToolDefinition[]): this {
    for (const tool of tools) {
      if (FORBIDDEN_TOOL_NAMES.includes(tool.name)) {
        throw new Error(`Refusing to register forbidden tool "${tool.name}"`);
      }
      if (DESTRUCTIVE_TOOL_NAMES.includes(tool.name) && tool.risk !== 'destructive') {
        throw new Error(`Tool "${tool.name}" must be registered with destructive risk`);
      }
      if (this.tools.has(tool.name)) {
        throw new Error(`Tool "${tool.name}" is already registered`);
      }
      this.tools.set(tool.name, tool);
    }
    return this;
  }

  /**
   * Undefined for an unknown name and for a hidden destructive tool alike, so
   * the executor reports `TOOL_NOT_FOUND` without revealing that the tool exists.
   */
  getTool(name: string): AgentToolDefinition | undefined {
    const tool = this.tools.get(name);
    return tool && this.isExposed(tool) ? tool : undefined;
  }

  listExposed(): AgentToolDefinition[] {
    return [...this.tools.values()].filter((tool) => this.isExposed(tool));
  }

  private isExposed(tool: AgentToolDefinition): boolean {
    return tool.risk !== 'destructive' || this.options.destructiveToolsEnabled;
  }
}

export function createToolRegistry(options: Partial<ToolRegistryOptions> = {}): ToolRegistry {
  return new ToolRegistry({
    destructiveToolsEnabled: options.destructiveToolsEnabled ?? config.ai.destructiveToolsEnabled,
  });
}
