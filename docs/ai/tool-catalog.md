# AI Agent Gateway — Tool Catalog

95 tools in one registry, shared by the OpenAPI and MCP adapters. 73 are exposed by default; the 22 marked **destructive** stay hidden until `AI_DESTRUCTIVE_TOOLS_ENABLED=true`.

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
| `list_server_group_permissions` | read | Every permission assigned directly to one server group |
| `set_server_group_permission` | write | One permission on one server group. `permnegated`/`permskip` default to 0 (TeamSpeak requires both present on the wire) |
| `remove_server_group_permission` | destructive | Restores the inherited value |
| `copy_server_group_permissions` | write | Copies every permission from one group onto another (or a new group) |
| `create_server_group` | write | `type` defaults to 1 (regular, assignable) |
| `rename_server_group` | write | |
| `delete_server_group` | destructive | Clients holding it lose every permission it granted |
| `list_channel_group_permissions` | read | Every permission assigned directly to one channel group |
| `set_channel_group_permission` | write | One permission on one channel group. `permnegated`/`permskip` default to 0 (TeamSpeak requires both present on the wire) |
| `remove_channel_group_permission` | destructive | Restores the inherited value |
| `create_channel_group` | write | `type` defaults to 1 (regular, assignable) |
| `rename_channel_group` | write | |
| `delete_channel_group` | destructive | |
| `assign_client_channel_group` | write | Scoped to one channel (`cgid` + `cid` + `cldbid`) |
| `list_channel_group_members` | read | |

## Virtual server

| Tool | Risk | Notes |
| ---- | ---- | ----- |
| `edit_virtual_server` | write | Name, messages, banner/button branding, default groups, limits, logging flags. Never sets the join password |

## Bans

| Tool | Risk | Notes |
| ---- | ---- | ----- |
| `list_bans` | read | IP addresses are never included |
| `add_ban` | destructive | At least one of `ip`, `name` or `uid` is required |
| `remove_ban` | destructive | |
| `remove_all_bans` | destructive | Every ban on the virtual server, cannot be undone |

## Channel files

| Tool | Risk | Notes |
| ---- | ---- | ----- |
| `list_channel_files` | read | Requires SSH access to be configured for the server |
| `create_channel_directory` | write | |
| `delete_channel_file` | destructive | |

## Complaints

| Tool | Risk | Notes |
| ---- | ---- | ----- |
| `list_complaints` | read | Optionally filtered by target client database id |
| `add_complaint` | write | |
| `delete_complaint` | destructive | Identified by target + filer client database ids |

## Offline messages

| Tool | Risk | Notes |
| ---- | ---- | ----- |
| `list_messages` | read | Metadata only |
| `get_message` | read | Full subject and body |
| `send_message` | write | Addressed by the recipient's TeamSpeak unique id (`cluid`) |
| `delete_message` | destructive | |

## Music library, playlists and radio

Distinct from the **Music bots** section below: this is the song library, playlists and radio-station presets, not a live bot's playback state. Playlists are not scoped to a TeamSpeak server (`playlistId`/`songId` only).

| Tool | Risk | Notes |
| ---- | ---- | ----- |
| `search_youtube` | read | |
| `get_youtube_info` | read | Metadata for a video or playlist URL |
| `list_songs` | read | One server's music library |
| `delete_song` | destructive | Also removes the file from disk |
| `download_song` | write | Reuses an existing song for the same URL; large videos can take a while |
| `list_music_requests` | read | Most recent 100 |
| `list_playlists` | read | Optionally filtered by `musicBotId` |
| `get_playlist` | read | With its ordered songs |
| `create_playlist` | write | |
| `edit_playlist` | write | Rename or reassign `musicBotId` |
| `delete_playlist` | destructive | The songs themselves stay in the library |
| `add_song_to_playlist` | write | |
| `remove_song_from_playlist` | destructive | |
| `reorder_playlist` | write | `songIds` must list every song in the playlist |
| `list_radio_presets` | read | Built-in presets, not server-specific |
| `list_radio_stations` | read | One server's saved stations |
| `add_radio_station` | write | The stream URL passes the SSRF validator |
| `delete_radio_station` | destructive | |

## Instance

`serverConfigId` only — no `virtualServerId`. These are instance-wide (`sid=0`), not per virtual server. `instanceedit` is deliberately not wrapped: it would change settings shared by every virtual server on the instance, a larger blast radius than any other write tool here.

| Tool | Risk | Notes |
| ---- | ---- | ----- |
| `get_instance_info` | read | Default groups, flood limits, etc. |
| `get_host_info` | read | Host machine metrics |
| `get_version` | read | TeamSpeak server version and platform |

## Discord bridge (read-only)

No `serverConfigId`/`virtualServerId`: the bridge is one process-wide connection. Every tool degrades to an empty/disabled result when the bridge hasn't started, instead of failing. The bot token is never read or set here.

| Tool | Risk | Notes |
| ---- | ---- | ----- |
| `get_discord_status` | read | |
| `list_discord_guilds` | read | |
| `list_discord_channels` | read | |
| `list_discord_roles` | read | |
| `list_discord_ts_channels` | read | TeamSpeak channels the bridge watches |

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

`delete_channel`, `kick_client`, `ban_client`, `remove_client_from_server_group`, `remove_channel_permission`, `stop_music_bot`, `clear_music_queue`, `disable_bot_flow`, `remove_server_group_permission`, `delete_server_group`, `remove_channel_group_permission`, `delete_channel_group`, `add_ban`, `remove_ban`, `remove_all_bans`, `delete_channel_file`, `delete_complaint`, `delete_message`, `delete_song`, `delete_playlist`, `remove_song_from_playlist`, `delete_radio_station`.

While the flag is false these are not listed by either adapter, and calling one by name returns `TOOL_NOT_FOUND`, the same answer as an unknown tool, so their existence is not confirmed.

## Common arguments

- `serverConfigId` and `virtualServerId` scope almost every tool. Resolve them with `list_servers`; never guess. Exceptions: the **Instance** tools take `serverConfigId` only (instance-wide, `sid=0`); the **Discord bridge** tools take neither (one process-wide connection); the **playlist** tools take neither (playlists are not scoped to a TeamSpeak server).
- Mutating tools accept an optional `idempotencyKey` (max 128 characters). Reusing one replays the stored result instead of repeating the action.
- Any list-style tool backed by WebQuery reads TeamSpeak error 1281 (`database_empty_result`) as an empty list, not a failure — TeamSpeak returns that error instead of an empty body when there is nothing to list.
