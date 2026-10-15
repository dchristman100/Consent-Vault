import { pgSchema, text, uuid, integer, timestamp, unique } from 'drizzle-orm/pg-core'

export const vault = pgSchema('consent_vault')
const date = (name: string) => timestamp(name, { withTimezone: true, mode: 'string' })

export const sites = vault.table('sites', {
  id: uuid('id').primaryKey().defaultRandom(),
  user_id: text('user_id').notNull(),
  site_name: text('site_name').notNull(),
  domain: text('domain').notNull(),
  site_key: text('site_key').notNull().unique(),
  status: text('status').notNull().default('active'),
  created_at: date('created_at').notNull().defaultNow(),
})

export const recordings = vault.table('recordings', {
  id: uuid('id').primaryKey().defaultRandom(),
  session_id: text('session_id').notNull().unique(),
  user_id: text('user_id').notNull(),
  site_id: uuid('site_id').notNull(),
  visitor_id: text('visitor_id').notNull(),
  page_url: text('page_url').notNull().default(''),
  referrer: text('referrer').notNull().default(''),
  ip_address: text('ip_address').notNull().default(''),
  user_agent: text('user_agent').notNull().default(''),
  screen_width: integer('screen_width'),
  screen_height: integer('screen_height'),
  status: text('status').notNull().default('recording'),
  event_count: integer('event_count').notNull().default(0),
  started_at: date('started_at').notNull().defaultNow(),
  submitted_at: date('submitted_at'),
  finalized_at: date('finalized_at'),
  events_file_url: text('events_file_url'),
})

export const batches = vault.table('batches', {
  id: uuid('id').primaryKey().defaultRandom(),
  user_id: text('user_id').notNull(),
  session_id: text('session_id').notNull(),
  batch_number: integer('batch_number').notNull(),
  storage_path: text('storage_path').notNull(),
  event_count: integer('event_count').notNull(),
  created_at: date('created_at').notNull().defaultNow(),
}, table => [unique().on(table.session_id, table.batch_number)])

export const screenshots = vault.table('screenshots', {
  id: uuid('id').primaryKey().defaultRandom(),
  user_id: text('user_id').notNull(),
  session_id: text('session_id').notNull(),
  storage_path: text('storage_path').notNull(),
  captured_at: date('captured_at').notNull().defaultNow(),
  created_at: date('created_at').notNull().defaultNow(),
})
