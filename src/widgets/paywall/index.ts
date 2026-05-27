// Client-safe exports only. Server-only loaders (`teasers.ts`,
// `admin-config.ts`) are intentionally NOT re-exported here — ChatInterface
// imports from this barrel and is a client component, so a `server-only`
// import would break the Next.js build trace. Server pages should import
// the loaders from their dedicated paths instead (see ./server.ts).
export { ExitIntentModal } from './ExitIntentModal'
export type { ExitIntentStrings, ExitIntentDiscount } from './ExitIntentModal'
export { ChatPaywallModal } from './ChatPaywallModal'
export type {
  ChatPaywallReason,
  ChatPaywallStrings,
  ChatPaywallPlans,
} from './ChatPaywallModal'
export type { PaywallTeaser } from './teasers-types'
