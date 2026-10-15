import { createHmac, randomUUID, timingSafeEqual } from 'node:crypto'
import { and, asc, eq } from 'drizzle-orm'
import { db } from '@/lib/db'
import { batches, recordings, screenshots, sites } from '@/lib/db/schema'
import { readRecordingFile, storeRecordingFile } from '@/lib/recording-storage'

const cors = { 'Access-Control-Allow-Origin': '*', 'Access-Control-Allow-Methods': 'POST, OPTIONS', 'Access-Control-Allow-Headers': 'Content-Type, Authorization' }
export function OPTIONS() { return new Response(null, {status:204,headers:cors}) }
function json(body:unknown,status=200){return Response.json(body,{status,headers:cors})}
function signature(value:string){return createHmac('sha256',process.env.BETTER_AUTH_SECRET!).update(`consent-vault-upload:${value}`).digest('base64url')}
function token(sessionId:string,userId:string){ const data=Buffer.from(JSON.stringify({sessionId,userId,expires:Date.now()+24*60*60*1000})).toString('base64url');return `${data}.${signature(data)}` }
function validToken(value:unknown,sessionId:string,userId:string){
  if(typeof value!=='string'||value.length>2048)return false
  try {const [data,mac]=value.split('.'); const expected=Buffer.from(signature(data)); const actual=Buffer.from(mac||'');if(actual.length!==expected.length||!timingSafeEqual(actual,expected))return false;const parsed=JSON.parse(Buffer.from(data,'base64url').toString());return parsed.sessionId===sessionId&&parsed.userId===userId&&parsed.expires>Date.now()}catch{return false}
}
export async function recordingEvents(path:string):Promise<any[]> {
  const result=await readRecordingFile(path)
  if(!result||result.statusCode!==200)throw new Error('Recording file unavailable')
  const data=await new Response(result.stream).json()
  if(!Array.isArray(data))throw new Error('Invalid recording file')
  return data
}
function text(value:unknown,maximum=4096){return typeof value==='string'?value.slice(0,maximum):''}
export function recorderHandler(action:'start'|'events'|'finalize'|'screenshot') {
  return async function POST(request:Request){
    try {
      const raw=await request.text()
      if(Buffer.byteLength(raw)>4_000_000)return json({error:'Payload too large'},413)
      let body:any
      try{body=JSON.parse(raw)}catch{return json({error:'Invalid JSON'},400)}
      if(typeof body.site_key!=='string'||body.site_key.length>200)return json({error:'Invalid site key'},400)
      // A public site key authorizes creation only; subsequent writes require a signed capability.
      const [site]=await db.select().from(sites).where(and(eq(sites.site_key,body.site_key),eq(sites.status,'active'))).limit(1)
      if(!site)return json({error:'Site not found'},404)
      const origin=request.headers.get('origin')
      if(origin){let host='';try{host=new URL(origin).hostname}catch{return json({error:'Invalid origin'},403)};if(host!==site.domain)return json({error:'Origin does not match site domain'},403)}
      if(action==='start') {
        const sessionId=randomUUID()
        const [row]=await db.insert(recordings).values({user_id:site.user_id,site_id:site.id,session_id:sessionId,visitor_id:randomUUID(),page_url:text(body.page_url),referrer:text(body.referrer),ip_address:text(request.headers.get('x-forwarded-for'),128),user_agent:text(request.headers.get('user-agent')),screen_width:Number.isInteger(body.screen_width)?Math.max(0,Math.min(100000,body.screen_width)):null,screen_height:Number.isInteger(body.screen_height)?Math.max(0,Math.min(100000,body.screen_height)):null}).returning()
        return json({success:true,session_id:row.session_id,visitor_id:row.visitor_id,site_id:site.id,upload_token:token(sessionId,site.user_id)})
      }
      if(typeof body.session_id!=='string'||!validToken(body.upload_token,body.session_id,site.user_id))return json({error:'Invalid upload authorization'},403)
      const condition=and(eq(recordings.user_id,site.user_id),eq(recordings.site_id,site.id),eq(recordings.session_id,body.session_id))
      const [session]=await db.select().from(recordings).where(condition).limit(1)
      if(!session)return json({error:'Session not found'},404)
      const prefix=`consent-vault/${site.user_id}/${session.session_id}`
      if(action==='events'){
        if(!Array.isArray(body.events)||!body.events.length||body.events.length>10000||!Number.isInteger(body.batch_number)||body.batch_number<0||body.batch_number>10000)return json({error:'Invalid event batch'},400)
        if(body.events.some((event:any)=>!event||typeof event!=='object'||!Number.isFinite(event.timestamp)))return json({error:'Invalid recording event'},400)
        await db.transaction(async tx=>{
          await tx.select({id:recordings.id}).from(recordings).where(condition).for('update')
          const [existing]=await tx.select({id:batches.id}).from(batches).where(and(eq(batches.user_id,site.user_id),eq(batches.session_id,session.session_id),eq(batches.batch_number,body.batch_number)))
          if(existing)return
          const path=await storeRecordingFile(`${prefix}/batch-${body.batch_number}.json`,JSON.stringify(body.events),'application/json')
          await tx.insert(batches).values({user_id:site.user_id,session_id:session.session_id,batch_number:body.batch_number,storage_path:path,event_count:body.events.length})
          const all=await tx.select({count:batches.event_count}).from(batches).where(and(eq(batches.user_id,site.user_id),eq(batches.session_id,session.session_id)))
          await tx.update(recordings).set({event_count:all.reduce((sum,row)=>sum+row.count,0),events_file_url:null}).where(condition)
        })
        return json({success:true,session_id:session.session_id,batch_number:body.batch_number})
      }
      if(action==='screenshot'){
        if(typeof body.screenshot!=='string')return json({error:'Invalid screenshot'},400)
        const match=body.screenshot.match(/^data:(image\/(?:png|jpeg));base64,([A-Za-z0-9+/=]+)$/)
        if(!match)return json({error:'Invalid screenshot'},400)
        const image=Buffer.from(match[2],'base64')
        if(image.length>3_000_000)return json({error:'Screenshot too large'},413)
        const path=await storeRecordingFile(`${prefix}/screenshot`,image,match[1] as 'image/png'|'image/jpeg')
        await db.insert(screenshots).values({user_id:site.user_id,session_id:session.session_id,storage_path:path})
        return json({success:true})
      }
      await db.transaction(async tx=>{
        await tx.select({id:recordings.id}).from(recordings).where(condition).for('update')
        const rows=await tx.select().from(batches).where(and(eq(batches.user_id,site.user_id),eq(batches.session_id,session.session_id))).orderBy(asc(batches.batch_number))
        const events=(await Promise.all(rows.map(row=>recordingEvents(row.storage_path)))).flat().sort((a,b)=>a.timestamp-b.timestamp)
        const path=await storeRecordingFile(`${prefix}/events.json`,JSON.stringify(events),'application/json')
        const now=new Date().toISOString()
        await tx.update(recordings).set({status:'finalized',finalized_at:now,submitted_at:now,events_file_url:path,event_count:events.length,...(typeof body.page_url==='string'?{page_url:text(body.page_url)}:{})}).where(condition)
      })
      return json({success:true,session_id:session.session_id})
    }catch(error){console.error('Recorder request failed',error);return json({error:'Unable to save recording. Please retry.'},500)}
  }
}
