import { q } from './db'

export type Onboarding = {
  id: string
  token: string
  status: 'sent' | 'started' | 'submitted' | 'void'
  form_key: string
  config: OnboardingConfig
  client: { name?: string; email?: string; mobile?: string; company?: string }
  answers: Record<string, any>
  submitted_at: string | null
}

/** Values the provider sets per deal or in Sales Desk settings. Anything missing is shown as "your ShiFt contact will send this". */
export type OnboardingConfig = {
  provider?: string
  ghl_access_email?: string
  meta_access_emails?: string
  ghl_trial_link?: string
  a2p_help_video?: string
  meta_help_video?: string
}

export async function loadOnboarding(token: string): Promise<Onboarding | null> {
  const rows = await q<Onboarding>(
    `select id, token, status, form_key, config, client, answers, submitted_at from esign.onboarding where token = $1 limit 1`,
    [token],
  )
  return rows[0] || null
}

/** Required answers per the onboarding spec (fields marked *). Returns the labels still missing. */
export function missingRequired(a: Record<string, any>): string[] {
  const miss: string[] = []
  const need = (k: string, label: string) => { if (!String(a[k] ?? '').trim()) miss.push(label) }
  const yes = (k: string) => a[k] === true || a[k] === 'yes'
  need('name', 'Your name'); need('email', 'Best email'); need('mobile', 'Mobile for text updates')
  need('has_ghl', 'Do you have a GHL account?')
  if (!yes('ghl_access_given')) miss.push('Confirm Agency Admin Access')
  need('ghl_account_name', 'GHL Agency or sub-account name')
  need('a2p_verified', 'Is the sub-account A2P verified?')
  if (a.a2p_verified === 'no' && !yes('a2p_prereqs_done')) miss.push('Confirm business information and GHL phone number')
  if (!yes('meta_access_given')) miss.push('Confirm Meta Full Control and Facebook Page')
  need('meta_business_name', 'Meta Business Suite name')
  if (a.has_offer === 'yes') {
    need('offer_target_location', 'Target Location'); need('offer_offer', 'The Offer')
    need('offer_pricing', 'Pricing structure'); need('offer_delivery', 'How are you delivering these results?')
  }
  return miss
}
