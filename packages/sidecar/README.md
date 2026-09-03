# sidecar — Media relay Go (WebRTC) para streaming de vídeo

## Objetivo do módulo

Serviço auxiliar em Go que converte uma fonte de vídeo (YouTube/Twitch/URL direta) em **WebRTC** (VP8 + Opus) via Pion, para o streaming de vídeo nos canais do TeamSpeak.

## Responsabilidade principal

Único dono da transcodificação de vídeo: recebe uma fonte, roda `ffmpeg` (VP8/Opus em RTP), absorve os pacotes RTP em filas limitadas, aplica pacing/atraso adaptativo e serve os tracks via peer connections WebRTC — aliviando o Node de todo o caminho de mídia de vídeo.

## Funcionalidades existentes

- **API HTTP** (`main.go`, padrões Go 1.22, middleware `secureAPI`): `POST /peer/create|answer|ice|close`, `POST /source`, `POST /source/stop`, `GET /stats`, `GET /health`. Bearer token com comparação constant-time (obrigatório; `/health` é a única rota aberta); corpos limitados a 1 MiB.
- **Pipeline de mídia**: `StartFFmpeg` (`-fflags +genpts+discardcorrupt`, VP8 `-deadline realtime`, Opus 48 kHz estéreo, pad/scale para as dimensões, `-ssrc` fixos 11111111/22222222) → sockets UDP locais efêmeros → 4 goroutines (leitura e processamento de vídeo/áudio) com filas limitadas e drop em overflow.
- **Pacing adaptativo** (`computeTrackDelay`): EMA de latência por track, `targetLatency = max(video, audio)`, buffers `SYNC_PLAYOUT_BUFFER_MS`/`SYNC_VIDEO_BIAS_MS`; vídeo só é enviado a um peer após o primeiro keyframe VP8 (parse manual do payload descriptor).
- **Peer management**: single-flight por ID, reuso de oferta ativa, ICE via API, tracks estáticos `video`/`audio` no stream `ts6-stream`, substituição atômica de peer antigo.
- **Validação de fonte** (`validSource`): apenas http/https ou fonte vazia (padrão de teste); rejeita caminhos locais/protocolos ffmpeg e argumentos com `-` inicial.
- **Shutdown gracioso** (SIGINT/SIGTERM): para leitores, mata ffmpeg, fecha sockets e peers.

## Dependências

- **Externas**: Go 1.25; `pion/webrtc/v4` + interceptor/rtp/rtcp; `ffmpeg` no runtime; stdlib `net/http`. Servidores STUN públicos (default fixo em `main.go`).
- **Internas**: nenhuma — processo independente, controlado pelo backend (`voice/streaming/`).

## Módulos relacionados

`packages/backend/src/voice/streaming/*` (spawn/controle), `voice/voice-bot.ts` (orquestração do streaming), `Dockerfile.sidecar`, docker-composes.

## Pontos de entrada

`main.go` (único arquivo). Variáveis de ambiente: `SIDECAR_TOKEN` (obrigatória — `log.Fatal` sem ela), `SIDECAR_PORT` (9800), `SIDECAR_LISTEN_ADDR` (127.0.0.1; `0.0.0.0` no Docker — nunca publicar a porta), `STUN_SERVERS`, `FFMPEG_PATH`, `VIDEO_QUEUE_SIZE`/`AUDIO_QUEUE_SIZE`, `VIDEO_WIDTH/HEIGHT/FRAMERATE/BITRATE/BUFSIZE`, `AUDIO_BITRATE`, `SYNC_PLAYOUT_BUFFER_MS`, `SYNC_VIDEO_BIAS_MS`, `AUDIO_DELAY_MS`, `VIDEO_RTP_READ_BUFFER`/`AUDIO_RTP_READ_BUFFER`, `SIDECAR_DEBUG_LOGS`.

## Fluxos importantes

`POST /source` → ffmpeg → RTP UDP local → filas → pacing → `track.WriteRTP` para peers Active+Started. Fluxo do backend: `/health` (waitHealthy) → `/peer/create` (offer) → `/peer/answer` + `/peer/ice` → `/source` → viewers.

## Arquivos críticos

`main.go` (1225 linhas: API, ffmpeg, RTP, pacing, ICE).

## Observações técnicas e débitos

- **Código morto**: `sendSenderReports` (main.go:708) nunca é chamado — o mecanismo de sincronização A/V por RTCP Sender Report (mesmo NTP/CNAME para os dois tracks) descrito nos comentários **não roda**; os contadores RTCP alimentam apenas esse caminho morto. `stopSR` é criado/fechado sem consumidor.
- Falta checagem de `gofmt` no CI (só `go build` + `go vet`); não há testes Go.
- Erro de digitação: `videOctetCount` (main.go:316).
- `go.sum` carrega `pion/transport/v3` residual além do v4 (**Hipótese**: churn do grafo de dependências).
