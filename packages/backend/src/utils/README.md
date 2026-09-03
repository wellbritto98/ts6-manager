# utils — Utilidades transversais (cripto, MFA, segurança, settings)

## Objetivo do módulo

Funções puras e serviços utilitários usados por quase todos os outros módulos do backend: cifragem de credenciais, TOTP, dispositivos confiáveis, GeoIP, bans web, validação de URL (SSRF), política de senha e settings de aplicação.

## Responsabilidade principal

Concentrar primitivas de segurança e persistência de configurações, com contratos testáveis e comportamento fail-closed/fail-open documentado.

## Funcionalidades existentes

- `crypto.ts` — AES-256-GCM: chave via `scryptSync(ENCRYPTION_KEY, 'ts6-webui-enc-v1')`, formato `enc:iv:tag:ciphertext` (hex); `decrypt` passa texto plano adiante (migração) e tem **fallback de leitura com chave legada** (JWT_SECRET).
- `mfa.ts` — TOTP (otplib, janela ±1), URI otpauth, geração de 10 recovery codes (64 bits, formato `a1b2-c3d4-e5f6-a7b8`; hashes SHA-256 armazenados), consumo constant-time.
- `trusted-device.ts` / `trusted-device-service.ts` — mint/split/hash do cookie `ts6_trusted` (TTL 30 d, `timingSafeEqual`), ciclo de vida cookie↔banco (path `/api/auth`).
- `geo.ts` — `normalizeIp` (IPv4-mapped IPv6, strip de porta) + `lookupCountry` via geoip-lite com detecção de faixa privada; nunca lança.
- `web-ban.ts` — `isIpWebBanned` (normaliza, purga expirados, nunca lança) + `durationToExpiry`.
- `url-validator.ts` — guarda anti-SSRF: whitelist de protocolos, bloqueio de hostnames (localhost, metadata cloud), rejeição de IPs privados literais e **re-checagem via DNS** (anti-DNS-rebinding; falha de DNS passa). Atenção: exige `maxRedirects: 0` nos chamadores (comentário no arquivo).
- `validate-password.ts` — política (`password.minLength` default 12, `password.requireComplexity`) + validação (maíus/minús/dígito/especial).
- `app-settings.ts` — acesso tipado ao AppSetting; hoje só o teto de importação de playlist (`max_playlist_import`, default 50) com parsing defensivo.
- `server-group-filter.ts` — mantém apenas grupos regulares (`type === '1'`); fail-open sem `type`.

## Dependências

- **Internas**: `config` (chave de cifragem), Prisma (AppSetting/WebBan/TrustedDevice).
- **Externas**: otplib, bcryptjs (política usa? — verificação de senha fica nas rotas), geoip-lite, nanoid.
- **Consumidores**: praticamente todo o backend — `routes/*`, `auth/*`, `ts-client/connection-pool`, `voice/*`, `discord/*`, `bot-engine/*`, `connection-journal.ts`.

## Módulos relacionados

`auth/` (usa mfa/trusted-device/validate-password), `routes/` (web-ban, geo, url-validator), `voice/audio/youtube.ts` e `bot-engine/flow-runner.ts` (SSRF via url-validator), `middleware/`.

## Pontos de entrada

Cada arquivo exporta funções puras/classes pequenas; não há barrel — consumidores importam caminhos diretos.

## Fluxos importantes

Login: ban web → bcrypt → MFA (otplib/recovery). Journal: IP → `normalizeIp` → `lookupCountry`. Qualquer URL de usuário (rádio, HTTP action, YouTube, ICY): `validateUrl` antes do fetch.

## Arquivos críticos

`crypto.ts` (formato de cifragem — retrocompatibilidade obrigatória), `url-validator.ts` (contrato anti-SSRF), `validate-password.ts` (política configurável).

## Observações técnicas e débitos

- **Fallback legado em `decrypt`** mantém compatibilidade com valores cifrados pela chave antiga (JWT_SECRET) — remover só com migração de dados.
- Nomes de chaves de AppSetting misturam ponto (`journal.retentionDays`, `password.minLength`) e underscore (`max_playlist_import`, `max_music_bots`) — não há registro central das chaves.
- Testes presentes para todos os arquivos deste módulo (crypto, geo, mfa, trusted-device*, validate-password, web-ban, server-group-filter, app-settings) — boa base de regressão.
