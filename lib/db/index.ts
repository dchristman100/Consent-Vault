import { Pool } from 'pg'
import { drizzle } from 'drizzle-orm/node-postgres'
import * as schema from './schema'

const globalDatabase = globalThis as unknown as { consentVaultPool?: Pool }
const connectionString = process.env.AGENCYOS_DATABASE_URL_UNPOOLED

if (!connectionString) {
  throw new Error('ConsentVault requires AGENCYOS_DATABASE_URL_UNPOOLED in this environment.')
}

export const pool = globalDatabase.consentVaultPool ?? new Pool({
  // Neon transaction pooling rejects startup search_path; use its direct endpoint.
  connectionString,
  // Keep Better Auth's unqualified table names away from other apps' schemas.
  options: '-c search_path=consent_vault',
  max: 5,
  connectionTimeoutMillis: 10000,
})

if (process.env.NODE_ENV !== 'production') globalDatabase.consentVaultPool = pool

export const db = drizzle(pool, { schema })
