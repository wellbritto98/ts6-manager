# auth — Sessões, MFA, dispositivos confiáveis e SAML

## Objetivo do módulo

Subsistema de autenticação do backend: sessões JWT (acesso/refresh), fluxo de login local com MFA, dispositivos confiáveis e SSO SAML.

## Responsabilidade principal

Emitir e validar credenciais de sessão com as garantias de segurança do projeto (classes de token, rotação de refresh com detecção de reuso, TOTP com recovery codes, cookie de dispositivo com verifier hasheado, SAML com assinatura/audience/replay).

## Funcionalidades existentes

- `session.ts` — `issueSession` (access JWT `typ:'access'` + refresh token 64B com `family`/`replacedBy`, expiração 7 dias **hardcoded**), `signMfaChallenge` (`typ:'mfa'`, 5 min), `gateAfterPassword` (decide mfa/setup/sessão).
- `saml/saml-config.ts` — monta a instância `@node-saml/node-saml` em runtime (`wantAssertionsSigned`, `validateInResponseTo: always`, ACS = `${FRONTEND_URL}/api/auth/saml/acs`) a partir das settings cifradas; `normalizeCert`.
- `saml/saml-user.ts` — perfil a partir da assertion (atributos → email local-part → NameID; `resolveRole` por atributo de grupo/valor).
- `saml/resolve-account.ts` — busca/provisão JIT por `(authProvider='saml', externalId)`, re-sincroniza displayName e papel **a cada login**, `disambiguateUsername` (`bob-2`…), recusa sem auto-provisioning.
- `saml/sso-code-store.ts` — códigos de troca SSO em memória (Map, 120 s, uso único).

## Dependências

- **Internas**: `utils/crypto` (segredos cifrados), `config` (expirações/segredos), Prisma (User/RefreshToken/TrustedDevice/SAMLSettings); `@ts6/common` (`JwtPayload`, `TokenType`).
- **Externas**: jsonwebtoken, bcryptjs, otplib (usado em `utils/mfa`), @node-saml/node-saml, nanoid.
- **Consumidores**: `routes/auth.routes.ts`, `routes/saml-auth.routes.ts`, `routes/saml.routes.ts`, `middleware/auth.ts` (verificação), `src/index.ts` (loadSamlRuntime + WS verifyClient — cópia da verificação).

## Módulos relacionados

`middleware/` (auth/HTTP), `utils/` (mfa, trusted-device*, validate-password, web-ban), `routes/` (auth + saml), `connection-journal` (registro de logins web).

## Pontos de entrada

`session.ts` (issueSession/gateAfterPassword), `saml/saml-config.ts` (loadSamlRuntime), `saml/resolve-account.ts`, `saml/sso-code-store.ts`.

## Fluxos importantes

1. **Login local** (`auth.routes.ts`): ban web → `canLocalLogin` (senha não-nula + habilitado) → bcrypt → `mustChangePassword`? token `pwchange` : `gateAfterPassword` (MFA? desafio `mfa` : sessão).
2. **MFA** (`/login/mfa`): TOTP ±1 passo → fallback recovery code (consumo constant-time) → sessão (+ dispositivo confiável opcional).
3. **Refresh** (`/refresh`): lookup → não achou → `replacedBy` aponta para ele? **revoga a família inteira** (reuso detectado) → rotação concorrente-safe via `updateMany` atômico.
4. **Dispositivo confiável**: cookie `ts6_trusted` (`selector.verifier`, path `/api/auth`, httpOnly, secure em produção) → `/trusted/peek` (identidade sem sessão) → `/trusted/session` (sessão sem senha/MFA, se permitido).
5. **SAML**: `/saml/login` → IdP → `/acs` (valida assertion) → resolve/provisiona conta → SSO code → redirect `/login/sso?code=` → `/exchange` consome o code → `gateAfterPassword` (MFA ainda se aplica).
6. **Enrollment de MFA**: `/mfa/setup` aceita access token **ou** desafio MFA (admin força primeiro login) → `/mfa/enable` gera 10 recovery codes (hashes SHA-256 armazenados, mostrados uma vez).

## Arquivos críticos

`session.ts` (formato e vida dos tokens), `saml/saml-config.ts`, `saml/resolve-account.ts`, `saml/sso-code-store.ts`.

## Observações técnicas e débitos

- **`config.jwtRefreshExpiry` é morto** — refresh expira em 7 dias hardcoded (`session.ts:19`); a env var não tem efeito.
- **SSO não passa por ban web nem journal**: `/acs` e `/exchange` não checam `isIpWebBanned` nem registram `recordWebLogin` (trilha de auditoria ausente para SSO).
- **Store de códigos SSO em memória** — quebra em multi-instância (premissa não documentada).
- **Rate limiting**: `/login/mfa`, `/login/change-password`, `/trusted/session`, `/saml/exchange` só têm o limitador global de 300/min.
- `issueSession(prisma: any, user: any)` — tipagem frouxa herdada.
- Testes cobrem os helpers do SAML e os utilitários; o fluxo de rotas em si não tem teste.
