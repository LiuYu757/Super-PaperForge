/**
 * Import this BEFORE `../../websocket/src/yjs-server` (ESM evaluates imports
 * in declaration order). The websocket service requires DATABASE_URL at module
 * load; in unit-test contexts there is no database, so provide a placeholder
 * unless a real one is already configured (the real-DB suite loads `.env.test`
 * and keeps it).
 */
if (!process.env.DATABASE_URL) {
  process.env.DATABASE_URL = 'postgresql://ws-unit:test@localhost:5432/ws-unit';
}