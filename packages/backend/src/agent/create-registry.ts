import { channelTools } from './tools/channel-tools.js';
import { clientTools } from './tools/client-tools.js';
import { flowTools } from './tools/flow-tools.js';
import { musicTools } from './tools/music-tools.js';
import { permissionTools } from './tools/permission-tools.js';
import { serverTools } from './tools/server-tools.js';
import { createToolRegistry, type ToolRegistry, type ToolRegistryOptions } from './tool-registry.js';

/**
 * The single catalog the OpenAPI and MCP adapters read. Both adapters share
 * this registry, so a tool cannot behave differently depending on how it was
 * called.
 */
export function createAgentRegistry(options: Partial<ToolRegistryOptions> = {}): ToolRegistry {
  return createToolRegistry(options).register(
    ...serverTools,
    ...channelTools,
    ...clientTools,
    ...permissionTools,
    ...musicTools,
    ...flowTools,
  );
}
