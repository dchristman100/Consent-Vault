import { format, isToday } from 'date-fns'

export function formatDate(date: string | null) {
  if (!date) return '-'
  return format(new Date(date), 'MMM dd, yyyy HH:mm:ss')
}

export function isSessionToday(dateString: string) {
  return isToday(new Date(dateString))
}

export function truncateUrl(url: string, maxLength: number = 40) {
  if (url.length <= maxLength) return url
  return url.slice(0, maxLength) + '...'
}

export function truncateUserAgent(ua: string, maxLength: number = 30) {
  if (!ua) return '-'
  if (ua.length <= maxLength) return ua
  return ua.slice(0, maxLength) + '...'
}

export function getStatusColor(status: string) {
  const base = 'rounded-full px-3 py-1 text-xs font-medium border-0'
  switch (status) {
    case 'recording':
      return `${base} bg-[#eff6ff] text-[#2563eb]`
    case 'submitted':
      return `${base} bg-[#fefce8] text-[#ca8a04]`
    case 'completed':
      return `${base} bg-[#f0fdf4] text-[#16a34a]`
    case 'finalized':
      return `${base} bg-[#f0fdf4] text-[#16a34a]`
    default:
      return `${base} bg-[#f1f5f9] text-[#64748b]`
  }
}

export function getStatusLabel(status: string) {
  return status.charAt(0).toUpperCase() + status.slice(1)
}
