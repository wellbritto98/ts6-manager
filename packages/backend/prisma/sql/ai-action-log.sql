CREATE TABLE IF NOT EXISTS "AiActionLog" (
  "id" INTEGER NOT NULL PRIMARY KEY AUTOINCREMENT,
  "requestId" TEXT NOT NULL,
  "idempotencyKey" TEXT,
  "externalUserId" TEXT NOT NULL,
  "actorEmail" TEXT,
  "actorName" TEXT,
  "chatId" TEXT,
  "messageId" TEXT,
  "serverConfigId" INTEGER,
  "virtualServerId" INTEGER,
  "toolName" TEXT NOT NULL,
  "risk" TEXT NOT NULL,
  "sanitizedArguments" TEXT NOT NULL,
  "sanitizedResult" TEXT,
  "status" TEXT NOT NULL,
  "errorCode" TEXT,
  "durationMs" INTEGER,
  "createdAt" DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP
);

CREATE UNIQUE INDEX IF NOT EXISTS "AiActionLog_requestId_key"
  ON "AiActionLog"("requestId");
CREATE UNIQUE INDEX IF NOT EXISTS "AiActionLog_externalUserId_toolName_idempotencyKey_key"
  ON "AiActionLog"("externalUserId", "toolName", "idempotencyKey");
CREATE INDEX IF NOT EXISTS "AiActionLog_externalUserId_createdAt_idx"
  ON "AiActionLog"("externalUserId", "createdAt");
CREATE INDEX IF NOT EXISTS "AiActionLog_toolName_createdAt_idx"
  ON "AiActionLog"("toolName", "createdAt");
CREATE INDEX IF NOT EXISTS "AiActionLog_serverConfigId_createdAt_idx"
  ON "AiActionLog"("serverConfigId", "createdAt");
