import { get, put } from '@vercel/blob'

const prefix = 'consent-vault/'

function assertRecordingPath(pathname: string) {
  if (!pathname.startsWith(prefix) || pathname.includes('..')) {
    throw new Error('Invalid recording storage path')
  }
}

export async function storeRecordingFile(
  pathname: string,
  body: string | Buffer,
  contentType: 'application/json' | 'image/png' | 'image/jpeg',
) {
  assertRecordingPath(pathname)
  const blob = await put(pathname, body, {
    access: 'private',
    contentType,
    addRandomSuffix: true,
  })
  return blob.pathname
}

// Call only after verifying the session owner or a server-issued upload capability.
export async function readRecordingFile(pathname: string) {
  assertRecordingPath(pathname)
  return get(pathname, { access: 'private', useCache: false })
}
