import { banTools } from './tools/ban-tools.js';
import { channelFileTools } from './tools/channel-file-tools.js';
import { channelGroupTools } from './tools/channel-group-tools.js';
import { channelTools } from './tools/channel-tools.js';
import { clientTools } from './tools/client-tools.js';
import { complaintTools } from './tools/complaint-tools.js';
import { discordTools } from './tools/discord-tools.js';
import { flowTools } from './tools/flow-tools.js';
import { instanceTools } from './tools/instance-tools.js';
import { messageTools } from './tools/message-tools.js';
import { musicLibraryTools } from './tools/music-library-tools.js';
import { musicTools } from './tools/music-tools.js';
import { permissionTools } from './tools/permission-tools.js';
import { playlistTools } from './tools/playlist-tools.js';
import { radioTools } from './tools/radio-tools.js';
import { serverGroupTools } from './tools/server-group-tools.js';
import { serverTools } from './tools/server-tools.js';
import { virtualServerTools } from './tools/virtual-server-tools.js';
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
    ...serverGroupTools,
    ...virtualServerTools,
    ...channelGroupTools,
    ...banTools,
    ...complaintTools,
    ...messageTools,
    ...channelFileTools,
    ...instanceTools,
    ...discordTools,
    ...musicLibraryTools,
    ...playlistTools,
    ...radioTools,
  );
}
