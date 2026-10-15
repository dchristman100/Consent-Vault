import { auth } from '@/lib/auth'
import { db } from '@/lib/db'
import { sites, recordings, batches, screenshots } from '@/lib/db/schema'
import { and, asc, desc, eq, getTableColumns } from 'drizzle-orm'
import { randomBytes } from 'node:crypto'

export async function POST(request: Request) {
  const session = await auth.api.getSession({ headers: request.headers })
  if (!session) return Response.json({ error: 'Please sign in.' }, { status: 401 })
  if (request.headers.get('origin') !== new URL(request.url).origin && request.headers.get('sec-fetch-site') === 'cross-site') return Response.json({error:'Forbidden'}, {status:403})
  const userId = session.user.id
  try {
    const { table, operation, filters = {}, values, limit } = await request.json()
    const maximum = Math.max(1, Math.min(Number(limit) || 500, 1000))
    if (table === 'sites') {
      if (operation === 'insert') {
        const name = typeof values?.site_name === 'string' ? values.site_name.trim() : ''
        const domain = typeof values?.domain === 'string' ? values.domain.trim() : ''
        if (!name || name.length > 200 || !domain || domain.length > 253) return Response.json({error:'Enter a valid site name and domain.'},{status:400})
        const url = new URL(domain.includes('://') ? domain : `https://${domain}`)
        if (!['https:', 'http:'].includes(url.protocol) || url.username || url.password) return Response.json({error:'Invalid domain.'},{status:400})
        const data = await db.insert(sites).values({user_id:userId,site_name:name,domain:url.hostname,site_key:randomBytes(32).toString('hex')}).returning()
        return Response.json({data})
      }
      if (operation === 'delete' && typeof filters.id === 'string') {
        await db.transaction(async tx => {
          const owned = await tx.select({id:sites.id}).from(sites).where(and(eq(sites.id,filters.id),eq(sites.user_id,userId)))
          if (!owned.length) return
          const rows = await tx.select({session_id:recordings.session_id}).from(recordings).where(and(eq(recordings.site_id,filters.id),eq(recordings.user_id,userId)))
          for (const row of rows) {
            await tx.delete(batches).where(and(eq(batches.session_id,row.session_id),eq(batches.user_id,userId)))
            await tx.delete(screenshots).where(and(eq(screenshots.session_id,row.session_id),eq(screenshots.user_id,userId)))
          }
          await tx.delete(recordings).where(and(eq(recordings.site_id,filters.id),eq(recordings.user_id,userId)))
          await tx.delete(sites).where(and(eq(sites.id,filters.id),eq(sites.user_id,userId)))
        })
        return Response.json({data:[]})
      }
      if(operation==='select') return Response.json({data:await db.select().from(sites).where(eq(sites.user_id,userId)).orderBy(desc(sites.created_at)).limit(maximum)})
    }
    if(table==='sessions') {
      const conditions = [eq(recordings.user_id,userId)]
      for(const key of ['id','session_id','visitor_id','status','site_id'] as const) if(typeof filters[key]==='string') conditions.push(eq(recordings[key],filters[key]))
      if(operation==='delete' && typeof filters.id==='string') {
        await db.transaction(async tx => {
          const [row] = await tx.select().from(recordings).where(and(...conditions))
          if(!row) return
          await tx.delete(batches).where(and(eq(batches.user_id,userId),eq(batches.session_id,row.session_id)))
          await tx.delete(screenshots).where(and(eq(screenshots.user_id,userId),eq(screenshots.session_id,row.session_id)))
          await tx.delete(recordings).where(and(...conditions))
        })
        return Response.json({data:[]})
      }
      if(operation==='select') return Response.json({data:await db.select({...getTableColumns(recordings),sites:{site_name:sites.site_name}}).from(recordings).leftJoin(sites,and(eq(sites.id,recordings.site_id),eq(sites.user_id,userId))).where(and(...conditions)).orderBy(desc(recordings.started_at)).limit(maximum)})
    }
    if(operation==='select' && typeof filters.session_id==='string') {
      if(table==='screenshots') {
        const rows=await db.select().from(screenshots).where(and(eq(screenshots.user_id,userId),eq(screenshots.session_id,filters.session_id))).orderBy(desc(screenshots.created_at)).limit(maximum)
        return Response.json({data:rows.map(({storage_path,...row})=>({...row,screenshot_url:`/api/files/${row.id}`}))})
      }
      if(table==='session_event_batches') return Response.json({data:await db.select().from(batches).where(and(eq(batches.user_id,userId),eq(batches.session_id,filters.session_id))).orderBy(asc(batches.batch_number)).limit(maximum)})
    }
    return Response.json({error:'Unsupported operation.'},{status:400})
  } catch(error) { console.error('Vault request failed',error); return Response.json({error:'Unable to complete request.'},{status:400}) }
}
