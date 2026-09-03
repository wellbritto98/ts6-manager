# discord — Ponte Discord (comandos, notificações, relay de voz)

## Objetivo do módulo

Integração com o Discord: controlar os bots de música por slash commands, notificar eventos do TeamSpeak (entrada/saída, canal vigiado, AFK), manter um painel de stats, e transmitir o áudio do bot de música para um canal de voz do Discord.

## Responsabilidade principal

Ser a **única porta de comunicação com a API do Discord** (discord.js), traduzindo eventos e comandos entre o TS e o Discord — reusando as operações de música do módulo `voice` (sem reimplementar lógica de mídia).

## Funcionalidades existentes

- `discord-bridge.ts` (~975 linhas) — `DiscordBridge`: startup com intents mínimas (+`GuildMessages`/`MessageContent` quando trigger de mensagem ativo), registro de slash commands na guild configurada, `reload()` hot (settings via painel), contador `startEpoch` contra callbacks de instâncias antigas.
  - **Slash commands**: `/play /stop /pause /skip /next /prev /queue /volume /nowplaying /lyrics /stats /join /leave` — handlers reusam `voice/music-ops.ts` e `voice/lyrics.ts`.
  - **Notificações de presença**: EventBridge SSH próprio (não o do engine — o engine poda conexões) assinando `notifycliententerview/moved/leftview`; modo canal vigiado ou servidor inteiro; templates editáveis com placeholders; bots de música excluídos (clids + nicknames); embed ou texto; auto-delete.
  - **AFK**: polling de 10 s (`clientlist -away`) + diff; mensagens de ida/volta com templates.
  - **Stats panel**: embed atualizado a cada 60 s (mensagem pinada via `statsMessageId` no banco).
  - **Member count**: apelido do bot "Base (N)" a cada 60 s e em eventos TS (cap de 32 chars do Discord).
  - **Now-playing**: anúncios no canal de notificações quando habilitado.
- `discord-voice.ts` — `DiscordVoiceRelay`: recebe **frames Opus já codificados** do `VoiceBot` via `setFrameSink` (48 kHz estéreo 20 ms — exatamente o formato do Discord), PassThrough object-mode → `createAudioResource(StreamType.Opus)`; watchdog de player idle; 5 s de tolerância a quedas.
- `command-permissions.ts` — restrição por roles: lista vazia = aberto; admin/owner sempre; senão precisa de role permitida.
- `embeds.ts` — builders puros (sem discord.js, testáveis): conecta/desconecta, now-playing, stats, fila, letras (chunk 4096), AFK; formatadores de duração/uptime/bytes; templates default.
- `away-diff.ts` / `member-count.ts` — diffs de AFK com seed silencioso na 1ª execução; detecção de bots de música e formatação de contagem.

## Dependências

- **Internas**: `voice/` (manager, music-ops, lyrics, tipos), `bot-engine/event-bridge.ts` (**import de internal do engine — violação de camada**), `ts-client/`, `utils/crypto` (token cifrado), Prisma (DiscordSettings), `ws/ws-broadcast` (via manager).
- **Externas**: discord.js, @discordjs/voice, @discordjs/opus (relay indireto).
- **Consumidores**: `routes/discord.routes.ts` (settings/status/pickers), `src/index.ts` (`app.locals.discordBridge`), `bot-engine` (mensagens Discord como trigger via `setMessageHandler`).

## Módulos relacionados

`voice/` (fonte de comandos/áudio), `bot-engine/` (trigger de mensagem + EventBridge), `routes/discord.routes.ts`, `packages/frontend` (Settings → Discord).

## Pontos de entrada

`discord-bridge.ts` (`DiscordBridge` — `start/reload/stop`, `commandAllowed`, pickers), `discord-voice.ts` (`DiscordVoiceRelay`), `command-permissions.ts` (`isCommandAllowed`).

## Fluxos importantes

1. **Comando**: interação Discord → `commandAllowed` (roles) → `resolvePlayQuery`/`downloadAndEnqueue` (music-ops) → fila do `VoiceBot`.
2. **Evento TS**: SSH `notify*` → `onTsEvent` (canal vigiado ou servidor) → template renderizado → embed/texto → auto-delete.
3. **Relay de voz**: `bot.setFrameSink(relay)` → frames Opus → resource → canal Discord; watchdog re-arma resource em idle.

## Arquivos críticos

`discord-bridge.ts` (tudo de alto nível), `discord-voice.ts` (contrato `setFrameSink`), `command-permissions.ts` (matriz de autorização).

## Observações técnicas e débitos

- **God object**: `discord-bridge.ts` empacota slash commands, notificações, AFK, contagem, stats e now-playing — candidato a split por feature.
- **3ª instância de EventBridge** (engine, journal, discord) → até 3 sessões SSH por par servidor+sid; acoplamento com internal do bot-engine.
- **2 chamadas WebQuery extras por notificação** (contagem do canal + nome), cache de 60 s.
- **Duplicação de skip/prev** com o handler de chat e flow-runner (ver `voice/README.md`).
- Testes: away-diff, embeds, command-permissions, member-count. Sem testes para bridge/relay.
