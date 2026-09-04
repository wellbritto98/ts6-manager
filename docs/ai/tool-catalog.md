# AI Agent Gateway — Tool Catalog

39 tools in one registry, shared by the OpenAPI and MCP adapters. 31 are exposed by default; the 8 marked **destructive** stay hidden until `AI_DESTRUCTIVE_TOOLS_ENABLED=true`.

Risk levels: **read** never changes state, **write** changes state reversibly, **destructive** removes something or cuts a session.

## Servers

| Tool | Risk | Notes |
| ---- | ---- | ----- |
| `list_servers` | read | Configured servers and their virtual servers. Start here to obtain `serverConfigId` |
| `get_server_status` | read | Live status of one virtual server |
| `get_server_dashboard` | read | Aggregated dashboard figures, same cache the SPA uses |
| `get_recent_server_logs` | read | Recent log lines for one virtual server |

## Channels

| Tool | Risk | Notes |
| ---- | ---- | ----- |
| `list_channels` | read | Topic, flags, limits and order |
| `get_channel` | read | Full property record for one `cid` |
| `create_channel` | write | Allowlisted properties only |
| `edit_channel` | write | Allowlisted properties only |
| `move_channel` | write | `cpid: 0` moves the channel to the server root |
| `delete_channel` | destructive | Removes the channel; clients inside are moved out |

## Clients

| Tool | Risk | Notes |
| ---- | ---- | ----- |
| `list_clients` | read | IP addresses are never included |
| `get_client` | read | One online client |
| `move_client` | write | Same virtual server only |
| `poke_client` | write | Short popup message to one client |
| `kick_client` | destructive | Ends the client's session |
| `ban_client` | destructive | Kick plus a ban entry |

## Groups and permissions

| Tool | Risk | Notes |
| ---- | ---- | ----- |
| `find_permission` | read | Resolve a permission by name before setting it |
| `get_permission_overview` | read | Effective permissions for a client in a channel |
| `list_server_groups` | read | Regular server groups with id and name |
| `list_channel_groups` | read | Channel groups with id and name |
| `add_client_to_server_group` | write | Takes a client database id, not a session id |
| `remove_client_from_server_group` | destructive | Revokes every permission the group granted |
| `set_channel_permission` | write | One permission on one channel |
| `remove_channel_permission` | destructive | Restores the inherited value |

## Music bots

| Tool | Risk | Notes |
| ---- | ---- | ----- |
| `list_music_bots` | read | Configured bots and their state |
| `get_music_bot_state` | read | Current track, volume, connection state |
| `list_music_queue` | read | Queue with shuffle and repeat mode |
| `start_music_bot` | write | Connects the bot to its TeamSpeak server |
| `play_media_url` | write | URL passes the SSRF validator before download |
| `pause_music_bot` | write | Keeps queue and position |
| `resume_music_bot` | write | Resumes paused playback |
| `skip_music_track` | write | Advances to the next queued track |
| `set_music_volume` | write | 0 to 100 |
| `stop_music_bot` | destructive | Disconnects the bot and ends playback |
| `clear_music_queue` | destructive | Cannot be undone |

## Bot flows

| Tool | Risk | Notes |
| ---- | ---- | ----- |
| `list_bot_flows` | read | Metadata only; the flow graph is not returned |
| `get_bot_flow` | read | Flow graph with credential-named fields redacted |
| `enable_bot_flow` | write | The engine starts reacting to the flow's triggers |
| `disable_bot_flow` | destructive | The engine stops reacting to the flow's triggers |

**`run_bot_flow` does not exist and will not be added.** `BotEngine.executeFlow` is private and has no safe manual entry point, so the name sits on the registry's forbidden list: registering it fails at startup.

## Names that can never be registered

`execute_webquery`, `execute_command`, `run_teamspeak_command`, `raw_api_request`, `execute_sql`, `run_bot_flow`. There is no generic command, HTTP or SQL passthrough anywhere in the catalog.

## Destructive set

`delete_channel`, `kick_client`, `ban_client`, `remove_client_from_server_group`, `remove_channel_permission`, `stop_music_bot`, `clear_music_queue`, `disable_bot_flow`.

While the flag is false these are not listed by either adapter, and calling one by name returns `TOOL_NOT_FOUND`, the same answer as an unknown tool, so their existence is not confirmed.

## Common arguments

- `serverConfigId` and `virtualServerId` scope almost every tool. Resolve them with `list_servers`; never guess.
- Mutating tools accept an optional `idempotencyKey` (max 128 characters). Reusing one replays the stored result instead of repeating the action.
