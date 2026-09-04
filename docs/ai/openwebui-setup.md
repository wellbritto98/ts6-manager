# Open WebUI Setup

Ten steps from a stock TS6 Manager deployment to a working AI assistant. Everything is optional: skipping this page leaves the SPA exactly as it was.

Before starting, set these in `.env`:

```
AI_AGENT_ENABLED=true
AI_GATEWAY_TOKEN=<openssl rand -hex 32>
AI_IDENTITY_JWT_SECRET=<openssl rand -hex 32, different value>
AI_ASSISTANT_PUBLIC_URL=https://ai.example.com
OPENWEBUI_SECRET_KEY=<openssl rand -hex 32>
OPENROUTER_API_KEY=<your OpenRouter key>
```

`AI_GATEWAY_TOKEN` and `AI_IDENTITY_JWT_SECRET` must be at least 32 characters and must differ from each other, from `JWT_SECRET` and from `ENCRYPTION_KEY`. The backend refuses to start otherwise.

## 1. Start the overlay

```bash
docker compose -f docker-compose.yml -f docker-compose.ai.yml up -d
```

The overlay merges with the base file: same project, same `ts6-network`, plus one `open-webui` container on `AI_WEBUI_PORT` (3002 by default). Confirm it is healthy with `docker compose ps`.

## 2. Create the first admin

Open `http://<host>:3002`. The first account created becomes the Open WebUI administrator. Create it immediately, before anyone else can reach the port.

## 3. Disable public signup

Set `ENABLE_SIGNUP=false` in `docker-compose.ai.yml` (or override it in your deployment) and recreate the container. The overlay ships `true` only so step 2 is possible. Leaving it on lets a stranger self-register into the instance that holds your OpenRouter key.

## 4. Add OpenRouter as the model provider

Admin Settings → Connections → OpenAI API:

- Base URL: `https://openrouter.ai/api/v1`
- API key: your OpenRouter key

The overlay already passes `OPENAI_API_BASE_URL` and `OPENAI_API_KEY`, so this is usually just a verification step.

## 5. Pick a model with native function calling

Tool use is the whole point. Choose a model that OpenRouter documents as supporting native tool/function calling; a model without it will describe actions in prose instead of calling them.

## 6. Register the tool server

Admin Settings → Tools → add a global tool server:

- URL: `http://backend:3001/api/agent/openapi.json`
- Auth: Bearer, value `AI_GATEWAY_TOKEN`

Use the container name `backend`, not a public hostname: the gateway is meant to stay on the Docker network.

**MCP alternative.** The same registry is served as MCP Streamable HTTP at `http://backend:3001/api/agent/mcp`, also on the Docker network only. The public frontend nginx returns 403 for that path, so an MCP client from the internet cannot reach it.

## 7. Create the model preset

Workspace → Models → create a preset named exactly:

```
TS6 Server Manager
```

Attach the model from step 5 and paste [skills/ts6-server-manager.md](skills/ts6-server-manager.md) as its system prompt.

## 8. Bind only the tools you need

On the preset, enable the tool server from step 6 and select only the tools that preset should use. A smaller tool list gives measurably better tool selection than exposing all of them.

## 9. Restrict the preset to admins

Set the preset visibility to private and share it only with the Open WebUI admin accounts that should manage TeamSpeak. For a second layer, list those accounts in `AI_ALLOWED_OPENWEBUI_USER_IDS` and/or `AI_ALLOWED_OPENWEBUI_EMAILS`; the backend then rejects everyone else with `FORBIDDEN`.

## 10. Turn on tool permissions and approval

Set `ENABLE_TOOL_PERMISSIONS=true` on the Open WebUI container and mark the sensitive tools as "Ask for approval" so a human confirms before they run.

Treat this as UI defense only. It runs inside Open WebUI and proves nothing to the backend. Destructive tools still require `AI_DESTRUCTIVE_TOOLS_ENABLED=true` on the backend, and while that flag is false those eight tools are not even listed.

## Rollback

No schema rollback is needed. `AiActionLog` is additive, so leaving the table in place breaks nothing.

1. Set `AI_AGENT_ENABLED=false` in `.env`.
2. Stop the overlay: `docker compose -f docker-compose.yml -f docker-compose.ai.yml down` (add `-v` only if you also want to drop the Open WebUI volume).
3. Restart normally: `docker compose up -d`.

The gateway routes disappear, the sidebar item disappears with `AI_ASSISTANT_PUBLIC_URL` unset, and the SPA behaves as it did before.
