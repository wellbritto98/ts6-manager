# Objetivo do Sistema — TS6 Manager

> Documento-base de produto para desenvolvimento futuro (Spec Driven Development).
> Toda afirmação deriva do código real, do `README.md` oficial e do `CHANGELOG.md`; inferências estão marcadas como **Hipótese**.
> Complemento técnico: [`arquitetura-do-sistema.md`](arquitetura-do-sistema.md) e os `README.md` de cada módulo.

---

## 1. Propósito principal

O **TS6 Manager** é uma **interface web de gerenciamento de servidores TeamSpeak** (fork endurecido do clusterzx/ts6-manager). Permite administrar servidores virtuais, canais, clientes, permissões, bans, tokens e arquivos pelo navegador — e adiciona capacidades que o cliente nativo do TeamSpeak não oferece: **bots de música controláveis por chat**, **automações visuais (bot flows)**, **integração com Discord**, **streaming de vídeo para canais**, **widgets incorporáveis** e um **journal de conexões**.

Em uma frase: *um painel de administração completo, com automação e mídia, para operadores de servidores TeamSpeak — acessível de qualquer navegador, sem expor credenciais aos usuários.*

## 2. Problemas que resolve

| Problema | Como o sistema resolve |
|---|---|
| Administração do TS limitada ao cliente desktop | Painel web completo (canais, clientes, grupos, permissões, bans, tokens, logs, arquivos) via WebQuery HTTP — telnet não é suportado |
| WebQuery desestabiliza após quedas de socket (NAT Docker, reinícios do servidor) | Cliente com keep-alive, retry de socket obsoleto e circuit breaker (`ts-client/webquery-client.ts`) — pool auto-recuperável, sem reiniciar o backend |
| Flood protection do TS derruba quem consulta demais | Cache de 5 s no dashboard; keep-alive com 1 socket por conexão para não multiplicar logins de query |
| Gerenciar múltiplos servidores/instâncias | Conexões por servidor com credenciais cifradas, seletor global e **controle de acesso por servidor** (multi-tenant) |
| Música em canais sem bot dedicado | Bots de música com protocolo de voz TS3 próprio (UDP), YouTube/Spotify/rádio, fila, comandos de chat (`!play`, `!radio`, …) e controle por grupos |
| Automação de rotinas de servidor (kick por idle, mover AFK, contadores) | Motor de fluxos visuais com gatilhos (eventos TS, cron, webhooks, chat, Discord), condições, variáveis e ações — com templates prontos |
| Servidores de comunidade com presença no Discord | Ponte Discord: slash commands de música, notificações de entrada/saída e AFK, painel de stats, relay de áudio |
| Compartilhar status do servidor em sites/fóruns | Widgets públicos por token (página, SVG, PNG), temas, sem autenticação |
| Auditoria de acessos e banimento por IP | Journal de logins web + TeamSpeak com GeoIP offline e ban de IP em um clique (web e/ou TS) |
| Segurança de credenciais e contas | AES-256-GCM para segredos armazenados, 2FA (TOTP) com códigos de recuperação, política de senha, SAML SSO, rotação de refresh tokens com detecção de reuso, SSRF-guard em URLs |
| Vídeo em canais TS (apresentações, filmes) | Streaming de vídeo YouTube/Twitch/URL direta via sidecar Go (WebRTC/Pion) com preview no navegador |

## 3. Principais fluxos de negócio

1. **Provisão inicial**: wizard `/setup` cria o primeiro admin (sem credenciais default) → login → cadastro da conexão TS em Settings → Connections (host, porta WebQuery, API key, SSH opcional) → uso imediato sem reiniciar o backend (pool auto-hidratado).
2. **Administração diária**: seleção servidor/servidor virtual no topo → dashboard ao vivo (usuários, canais, uptime, ping, banda) → gestão de canais (drag-and-drop), clientes (kick/ban/move/poke/mensagem), grupos e permissões (editor em 4 níveis), bans, tokens, arquivos, logs, reclamações, mensagens offline.
3. **Música**: criar bot em Music Bots → iniciar (conecta no canal via protocolo de voz próprio) → tocar via painel, `!play <url>`/`!radio` no chat do TS ou `/play` no Discord → fila com volume/pause/skip/shuffle/repeat → biblioteca local com upload, busca YouTube e importação de playlists (teto configurável `max_playlist_import`, default 50).
4. **Automação**: criar fluxo no editor visual (gatilhos + condições + ações) ou importar template → ativar → eventos fluem por SSH → execução com variáveis, delays, loops e logs → histórico de execuções auditável.
5. **Discord**: configurar bot token e canais em Settings → comandos slash de música, notificações de presença (estilo embed/plain, auto-delete), avisos de AFK, painel de stats atualizado, contagem de membros no nickname, relay de áudio do bot de música.
6. **Vídeo**: Music Bots → aba Video → colar fonte → iniciar (quality presets 480p/720p/1080p) → viewers do canal assistem via cliente TS (sinalização nativa) → preview WebRTC no painel.
7. **Widgets**: Dashboard → Widgets → criar (tema, servidor, opções de árvore) → copiar iframe/URL/SVG/PNG/BBCode → público acessa por `/widget/:token` sem login.
8. **Segurança e auditoria**: login com 2FA opcional/obrigatório, dispositivos confiáveis (cookie 30 dias revogável), troca forçada de senha, SAML SSO com provisionamento JIT e papel sincronizado a cada login; journal de conexões → ban de IP.
9. **Recuperação de acesso**: runbook documentado (`docs/recover-server-access.md`) para chaves WebQuery expiradas, senha do `serveradmin`, flood bans e reconfiguração do query.

## 4. Atores envolvidos

| Ator | Interação |
|---|---|
| **Admin** (papel `admin` no app) | Tudo: servidores, usuários do app, settings de integração (Discord/Spotify/YouTube/SAML), fluxos, bots de música, bans, journal. Único criado no setup; demais provisionados por admins (ou SAML JIT) |
| **Viewer** (papel `viewer`) | Leitura das áreas do app para servidores aos quais tem concessão (`UserServerAccess`); não vê IPs, tokens completos nem logs (rotas admin-only); Settings restringe-se à própria conta (idioma, senha, MFA, dispositivos confiáveis) |
| **Usuários do TeamSpeak** (não logados no app) | Controlando bots de música por comandos de chat (`!play`, `!radio`, …) quando no canal do bot — restrição opcional por server group; visualizando widgets públicos; recebendo automações dos fluxos |
| **Usuários do Discord** | Slash commands de música (restrição opcional por role), notificações e painel de stats |
| **IdP SAML** (provedor de identidade) | Fonte de SSO: autentica e fornece atributos de username/email/displayName/grupo (papel mapeado, reavaliado a cada login) |
| **Servidor TeamSpeak** (WebQuery + SSH) | Backend do sistema: fonte de dados e alvo de comandos; SSH apenas para eventos/arquivos |
| **Serviços externos**: Spotify Web API, LRCLIB/lyrics.ovh, Discord API, yt-dlp/YouTube, STUN público | Provedores de metadados, mídia e conectividade WebRTC |

## 5. Funcionalidades centrais

- **Gestão de servidor**: dashboard ao vivo (com gráfico de banda), servidores virtuais (start/stop/edição/snapshots), árvore de canais com reordenação, clientes com ações, grupos de servidor/canal, editor de permissões em 4 níveis, bans, tokens/privilege keys, reclamações, mensagens offline, logs, navegador de arquivos (SSH), settings de instância.
- **Música**: múltiplos bots por servidor, cada um com fila/volume/estado próprios; rádio com ICY metadata e título ao vivo; YouTube via yt-dlp (busca, download, fila, playlists); Spotify (metadados → YouTube); biblioteca local com playlists; controle por texto no canal e por slash commands no Discord; histórico de pedidos.
- **Discord**: bridge com slash commands, notificações (entrada/saída, canal vigiado, AFK), stats panel, contagem no nickname, relay de voz (frames Opus já codificados).
- **Vídeo**: streaming YouTube/Twitch/URL direta para canal TS via sidecar Go (Pion WebRTC), presets de qualidade, preview no browser, sincronização A/V (parcial — ver débitos na arquitetura §8).
- **Bot flows**: editor visual de nós; gatilhos (eventos TS3, cron com timezone, webhooks com segredo obrigatório, comandos de chat globais/por canal, mensagens Discord); 25+ ações (kick, ban, move, mensagem, poke, canais, grupos, HTTP, WebQuery whitelisted, Discord, voz); condições/expressões seguras, variáveis, delays, loops, logs; animação de nomes de canal; 16 templates.
- **Widgets**: banner de status incorporável (página/SVG/PNG), 6 temas, token público, cache, sem autenticação.
- **Segurança**: 2FA TOTP com recovery codes, dispositivos confiáveis, política de senha, troca forçada, SAML SSO (assinatura obrigatória, audience, replay, código de troca de uso único), JWT com classes de token, rotação de refresh com detecção de reuso, cifragem AES-256-GCM, SSRF-guard, rate limiting, RBAC + acesso por servidor, whitelists de comandos/parâmetros.
- **Journal**: logins web + TS com GeoIP offline, filtros e ordenação, ban de IP em um clique, retenção configurável.
- **Multi-idioma**: EN/FR/DE/ES/IT, por usuário, com fallback entre dispositivos.

## 6. Visão de produto

- **Posicionamento**: ferramenta de operação para administradores e comunidades de TeamSpeak que precisam de painel web, automação e mídia sem código próprio — a evolução "hardened, reliability-focused" do projeto original (per `README.md` e CHANGELOG).
- **Evolução observada (CHANGELOG)**: (1) passe de hardening de segurança (revisão 2026-08-06: classes de token, whitelists, SSRF, sidecar com auth, binários removidos do git); (2) resiliência de auth/UX (corridas de refresh, role sync, MFA enrolment); (3) série de features de importação de playlists YouTube. Padrão: cada mudança é descrita em nível de comportamento, incluindo modos de falha.
- **Direção declarada no produto**: simplicidade de implantação (Docker a partir do código-fonte, sem credenciais default), confiabilidade operacional (auto-recuperação, sem reinícios do backend para editar conexões) e segurança por padrão (fail-closed em segredos e permissões).
- **Não-objetivos (derivados do código)**: substituir o cliente TeamSpeak; suportar telnet/ServerQuery raw; ser multi-instância (estado em memória assume 1 processo — ver arquitetura §8); prover multi-usuário com granularidade fina além de admin/viewer + concessões por servidor.

## 7. Contexto operacional

- **Implantação**: Docker Compose (3 containers: backend Node :3001, frontend nginx-unprivileged :8080, sidecar Go :9800); variante para Coolify (sem sidecar — sem vídeo); variante com imagens do Docker Hub upstream (sem os fixes deste fork). Backend container roda auto-update do yt-dlp + `prisma db push` + seed antes de iniciar.
- **Requisitos do servidor TS**: WebQuery HTTP habilitado (porta 10080, `x-api-key`) — obrigatório; SSH (10022) — necessário apenas para eventos de fluxo, navegação de arquivos e journal TS; `yt-dlp` e `ffmpeg` no host do backend.
- **Persistência**: SQLite único (`/app/packages/backend/data/ts6webui.db`) + volume de música (`/data/music`); credenciais e segredos cifrados com `ENCRYPTION_KEY` (definir uma vez — trocar a chave torna linhas antigas ilegíveis).
- **Segredos de ambiente**: `JWT_SECRET` e `ENCRYPTION_KEY` obrigatórios (≥32 chars, distintos); `SIDECAR_TOKEN` obrigatório em modo container; `FRONTEND_URL` define o CORS exato.
- **Operação em produção**: logs via `console.*` do Node (pino declarado, sem uso); o WS de eventos (`/ws`) serve atualizações em tempo real de música e fluxos; falhas de componentes de mídia não derrubam o processo (handlers globais de exceção deliberados).
- **Auditoria e recuperação**: journal com retenção configurável (default 90 dias) e runbook de recuperação de acesso ao TS (`docs/recover-server-access.md`) cobrindo expiração de API key, reset de `serveradmin`, flood bans e reconfiguração do query.
