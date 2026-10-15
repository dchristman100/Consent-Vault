'use client'

import { authClient } from '@/lib/auth-client'

// Transitional query interface keeps the existing dashboards intact; all access is
// executed by a fixed, owner-scoped server API, never by a browser database key.
class VaultQuery {
  private operation = 'select'
  private filters: Record<string, string> = {}
  private values: unknown
  private one = false
  private maximum = 500
  constructor(private table: string) {}
  select(_columns = '*') { return this }
  order(_column: string, _options?: { ascending: boolean }) { return this }
  eq(column: string, value: string) { this.filters[column] = value; return this }
  limit(value: number) { this.maximum = value; return this }
  single() { this.one = true; return this }
  maybeSingle() { this.one = true; return this }
  insert(values: unknown) { this.operation = 'insert'; this.values = values; return this }
  delete() { this.operation = 'delete'; return this }
  async execute(): Promise<{ data: any; error: Error | null }> {
    try {
      const response = await fetch('/api/vault', { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ table: this.table, operation: this.operation, filters: this.filters, values: this.values, limit: this.maximum }) })
      const result = await response.json()
      if (!response.ok) throw new Error(result.error || 'Request failed')
      return { data: this.one ? result.data[0] ?? null : result.data, error: null }
    } catch (error) { return { data: null, error: error instanceof Error ? error : new Error('Request failed') } }
  }
  then<TResult1 = { data: any; error: Error | null }, TResult2 = never>(resolve?: ((value: { data: any; error: Error | null }) => TResult1 | PromiseLike<TResult1>) | null, reject?: ((reason: any) => TResult2 | PromiseLike<TResult2>) | null) { return this.execute().then(resolve, reject) }
}
const client = {
  from: (table: string) => new VaultQuery(table),
  auth: {
    getUser: async () => { const result = await authClient.getSession(); return { data: { user: result.data?.user ?? null }, error: result.error } },
    signOut: () => authClient.signOut(),
    signInWithPassword: (credentials: {email: string; password: string}) => authClient.signIn.email(credentials),
  },
}
export function createClient() { return client }
