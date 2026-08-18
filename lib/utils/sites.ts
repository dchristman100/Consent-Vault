/**
 * Generate a unique site key combining a slug of the site name + random alphanumeric characters
 * Example: "rooferfuel-vsl-8f7a92"
 */
export function generateSiteKey(siteName: string): string {
  const slug = siteName
    .toLowerCase()
    .trim()
    .replace(/[^a-z0-9]+/g, '-')
    .replace(/^-+|-+$/g, '')
    .slice(0, 10)

  const randomChars = Math.random().toString(36).substring(2, 8)
  return `${slug}-${randomChars}`
}

/**
 * Format a date to a readable string
 */
export function formatDate(date: string | Date): string {
  return new Date(date).toLocaleDateString('en-US', {
    year: 'numeric',
    month: 'short',
    day: 'numeric',
  })
}
