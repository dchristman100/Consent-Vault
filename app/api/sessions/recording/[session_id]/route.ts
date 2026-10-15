import { auth } from '@/lib/auth'
import { db } from '@/lib/db'
import { batches, recordings } from '@/lib/db/schema'
import { recordingEvents } from '@/lib/recorder-api'
import { and, asc, eq, or } from 'drizzle-orm'

export async function GET(request:Request,{params}:{params:Promise<{session_id:string}>}){
  const session=await auth.api.getSession({headers:request.headers})
  if(!session)return Response.json({error:'Unauthorized'},{status:401})
  try{
    const {session_id:id}=await params
    const [row]=await db.select().from(recordings).where(and(eq(recordings.user_id,session.user.id),or(eq(recordings.session_id,id),eq(recordings.visitor_id,id)))).limit(1)
    if(!row)return Response.json({error:'Not found'},{status:404})
    let events:any[]
    if(row.events_file_url)events=await recordingEvents(row.events_file_url)
    else {
      const files=await db.select().from(batches).where(and(eq(batches.user_id,session.user.id),eq(batches.session_id,row.session_id))).orderBy(asc(batches.batch_number))
      events=(await Promise.all(files.map(file=>recordingEvents(file.storage_path)))).flat()
    }
    events.sort((a,b)=>a.timestamp-b.timestamp)
    return Response.json({session_id:row.session_id,source:row.events_file_url?'merged':'batches',events},{headers:{'Cache-Control':'private, no-store'}})
  }catch(error){console.error('Playback failed',error);return Response.json({error:'Unable to load recording'},{status:500})}
}
