# voice — Bots de música: protocolo de voz TS3, áudio, fila e streaming

## Objetivo do módulo

Subsistema de mídia do TS6 Manager: bots que entram em canais do TeamSpeak e tocam música (YouTube/Spotify/rádio/biblioteca local), controláveis pelo painel, por comandos de texto no chat e por slash commands do Discord — além do streaming de vídeo para canais.

## Responsabilidade principal

Falar o **protocolo de voz TS3 nativo por UDP** (portado do TSLib/DreamSpeak), transformar mídia baixada em Opus com pacing de 20 ms, manter filas com shuffle/repeat, e orquestrar o sidecar Go para vídeo. Tudo com auto-reconexão e cifragem de identidade em repouso.

## Funcionalidades existentes

### `tslib/` — protocolo TS3 de voz (UDP)
- `client.ts` — `Ts3Client`: handshake Init0 → **puzzle RSA** (`x^(2^level) mod n`) → `initivexpand`/`initivexpand2` (ECDH + licença Ed25519 com raiz hardcoded → `ivStruct`), `clientinit` (senha = base64(sha1)), contadores por tipo com geração, resend a cada 100 ms (timeout 30 s), ping 1 s, fragmentação/reassemblagem (>~472 B), auto-move para o canal default. **A verificação da prova do servidor é pulada** (`client.ts:843`).
- `identity.ts` + `identity-worker.ts` — identidade ECDSA P-256 com brute-force de security level (default 23, ~5 s) em **Worker thread** (KeyObjects não cruzam threads); import de identidade real do TS3 (`0V<base64>`).
- `crypto.ts` — **AES-128-EAX** feito à mão (CMAC + CTR), derivação de chave/nonce por geração.
- `quicklz.ts` — descompressão QuickLZ nível 1 (teto 1 MiB).
- `license.ts` — parse da licença do servidor (cadeia Ed25519) e derivação de chave com libsodium.
- `commands.ts` — build/parse de comandos (escapes) — **reimplementa** `tsEscape`/`parseQueryResponse` do `@ts6/common`.

### `audio/`
- `youtube.ts` — yt-dlp: metadata (`--dump-json`), download (`-x --audio-format opus`), dedupe de downloads concorrentes, cache em disco, rejeição de artefatos (`.part`), `nice -n 19`, timeouts, cookie file opcional, busca (`ytsearchN:`), detecção de playlists, `assertSafeUrl` (anti-injeção de argumento).
- `pipeline.ts` — ffmpeg PCM s16le 48 kHz → `encodeFrame` (**@discordjs/opus nativo, fallback opusscript WASM**), volume por amostra, complexidade via `OPUS_COMPLEXITY`.
- `spotify.ts` — metadados Spotify (token client-credentials com cache) resolvidos para YouTube por `scoreCandidate`.
- `icy-metadata.ts` — cliente HTTP/ICY cru (Node não parseia `ICY 200 OK`) para `StreamTitle` de rádios, 5 redirects re-validados com `validateUrl`.

### Fila, comandos e importação
- `playlist/queue.ts` — fila em memória com shuffle/repeat e movimentação em espaço de exibição; regressões "Bug 1"/"Bug 2" pinadas por teste.
- `music-command-handler.ts` — comandos de texto (`!play !radio !spotify !stop !pause !skip !prev !vol !np !queue !add !lyrics !stream !stopstream !viewers !channels !move !moveall !notif !help !info`); chegada na própria conexão TS do bot (sem SSH); respostas no canal ou privado; teto de 60 linhas em `!channels`.
- `music-command-access.ts` — tier `open|music|admin` mapeado para server groups (settings com cache de 5 s; falha ao resolver o invocador = negado).
- `music-ops.ts` — operações agnósticas de transporte (`downloadAndEnqueue`, `resolvePlayQuery`, `enqueueSpotify`, `MUSIC_DIR`) reusadas por chat TS e slash Discord.
- `playlist-import-plan.ts` + `playlist-import.ts` — importação em dois estágios: plano (URLs `list=` sem `v=`, cap configurável, já-presentes não consomem cap) e importador (um job por servidor, downloads progressivos, reuso de `Song` por `sourceUrl`, falhas por track coletadas, jobs retidos 1 h, já-presentes reemitidos para tocar).
- `lyrics.ts` — LRCLIB → lyrics.ovh.

### Bot, manager e streaming
- `voice-bot.ts` (~1190 linhas) — `VoiceBot`: conexão, pacing de 20 ms (dois loops quase idênticos: stream e arquivo), pause por backpressure, seek matando/renascendo o ffmpeg, ICY polling 15 s, nickname "now playing", **orquestração completa de vídeo** (`startVideoStream`/`stopVideoStream`/viewers/WebRTC preview).
- `voice-bot-manager.ts` — criação (teto `max_music_bots`), identidade cifrada, start/stop/restart, auto-reconexão com backoff (2^n × 1 s, máx. 30 s, 10 tentativas), broadcasts WS escopados, erros fatais TS (2568/3329/1796).
- `streaming/` — `sidecar-process.ts` (spawn com env; SIGTERM→SIGKILL 3 s), `sidecar-client.ts` (HTTP bearer: health/peer/source/stats), `stream-signaling.ts` (eventos TS6 `notifystream*` ↔ API do sidecar), `types.ts` (presets 480p/720p/1080p).

## Dependências

- **Internas**: `ts-client/` (WebQuery para listas/canais), `utils/crypto` (identidade cifrada), `utils/url-validator` (SSRF), `utils/app-settings`, `ws/ws-broadcast`, `@ts6/common` (tipos de música), `../generated/prisma`.
- **Externas**: binários `yt-dlp` e `ffmpeg`; sidecar Go (container ou spawn); npm: `@discordjs/opus` (opcional nativo), `opusscript`, `libsodium-wrappers-sumo`; APIs Spotify Web API, LRCLIB, lyrics.ovh.
- **Consumidores**: `routes/music-bots.routes.ts`, `routes/music-library.routes.ts`, `routes/playlists.routes.ts`, `routes/radio-stations.routes.ts`, `routes/music-command-settings.routes.ts`, `routes/widget-public.routes.ts` (player widget), `discord/`, `bot-engine/flow-runner.ts` (ações de voz via injeção), `connection-journal.ts`, `src/index.ts`.

## Módulos relacionados

`discord/` (slash commands via `music-ops`; relay de áudio via `setFrameSink`), `bot-engine/` (ações de voz), `routes/`, `packages/sidecar` (vídeo), `packages/frontend` (páginas MusicBots/MusicRequests).

## Pontos de entrada

`voice-bot-manager.ts` (`VoiceBotManager` — superfície pública), `music-ops.ts`, `music-command-handler.ts` (`MusicCommandHandler`), `playlist-import.ts` (`PlaylistImporter`), `audio/youtube.ts` (funções usadas também por rotas). `voice/index.ts` é um barrel **sem consumidores**.

## Fluxos importantes

1. **Play**: URL → `downloadAndEnqueue` (yt-dlp → cache) → fila → `startFilePlaybackLoop`: 1 frame PCM 3840 B → `encodeAndSend` → tick 20 ms com ressincronização sem burst.
2. **Comando de texto**: `notifytextmessage` na conexão do bot → tier/access check → operação → resposta no canal/privado.
3. **Reconexão**: `disconnected` e não manual → backoff até 10× → fatal (erros específicos) = `error` sem retry.
4. **Vídeo**: `setupstream` → sidecar healthy → fonte resolvida (yt-dlp p/ YT/Twitch) → `/source` → viewers entram via `notifyjoinstreamrequest` → `/peer/create` → offer ao TS.
5. **Import de playlist**: plan → job único por servidor → downloads progressivos → tracks emitidos (UI ou chat) → resumo com falhas.

## Arquivos críticos

`voice-bot.ts`, `voice-bot-manager.ts`, `tslib/client.ts`, `tslib/crypto.ts`, `audio/pipeline.ts`, `playlist-import.ts`.

## Observações técnicas e débitos

- **`voice-bot.ts` é god object** (~1190 linhas): vídeo (~325 linhas) e os dois loops de pacing são candidatos claros a extração.
- **skip/prev reimplementados 3×** (handler, discord-bridge, flow-runner) apesar de `bot.skip()/previous()` existirem.
- **`serverPassword`/`channelPassword` em texto plano** no modelo; `identityData` é cifrado na criação.
- **`(dbBot as any).sidecarPort`/`streamPreset`** — campos ausentes do schema Prisma, castados (adicionar ao modelo).
- **1 s hardcoded** esperando ACK do `stopstream` (`voice-bot.ts:1036`) — sinal, não timing.
- **Duplicação de `tsEscape`/`parseCommand`** com `@ts6/common` (`tslib/commands.ts`).
- **`enqueueSpotify` baixa álbuns estritamente em série** (50 tracks = 50 downloads sequenciais).
- **Prova do servidor não verificada** no `initivexpand2` — risco documentado no protocolo.
- **Caminho do worker**: `identity-worker.js` resolvido de `import.meta.url` — **Hipótese**: sob `tsx watch` pode apontar para fonte não compilado.
- `voice/index.ts` órfão; bloco de debug comentado em `pipeline.ts:111-116`.
- Testes: queue (regressões), playlist-import-plan, youtube (artefatos), spotify, lyrics, music-command-access, music-ops, crypto do tslib. Sem testes para voice-bot/manager/handler/pipeline/streaming/tslib-client.
