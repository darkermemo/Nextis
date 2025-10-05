import { Pool, neonConfig } from '@neondatabase/serverless';
import { drizzle } from 'drizzle-orm/neon-serverless';
import ws from "ws";
import { webcrypto } from 'node:crypto';
import * as schema from "@shared/schema";

neonConfig.webSocketConstructor = ws;
// Ensure WebCrypto is available for @neondatabase/serverless in Node 18
// (used for randomBytes / SASL auth)
// eslint-disable-next-line @typescript-eslint/ban-ts-comment
// @ts-ignore
if (!globalThis.crypto) globalThis.crypto = webcrypto as unknown as Crypto;

if (!process.env.DATABASE_URL) {
  throw new Error(
    "DATABASE_URL must be set. Did you forget to provision a database?",
  );
}

export const pool = new Pool({ connectionString: process.env.DATABASE_URL });
export const db = drizzle({ client: pool, schema });