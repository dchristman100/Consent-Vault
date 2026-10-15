import { auth } from '@/lib/auth'
import { db } from '@/lib/db'
import { screenshots } from '@/lib/db/schema'
import { and, eq } from 'drizzle-orm'
import { readRecordingFile } from '@/lib/recording-storage'
export async function GET(request:Request,{params}:{params:Promise<{id:string}>}){
  const session=await auth.api.getSession({headers:request.headers})
  if(!session)return new Response('Unauthorized',{status:401})
  const {id}=await params
  if(!/^[0-9a-f-]{36}$/i.test(id))return new Response('Not found',{status:404})
  const [row]=await db.select().from(screenshots).where(and(eq(screenshots.id,id),eq(screenshots.user_id,session.user.id))).limit(1)
  if(!row)return new Response('Not found',{status:404})
  const file=await readRecordingFile(row.storage_path)
  if(!file||file.statusCode!==200)return new Response('Not found',{status:404})
  return new Response(file.stream,{headers:{'Content-Type':file.blob.contentType,'Cache-Control':'private, no-store','X-Content-Type-Options':'nosniff'}})
}
