import { NextIntlClientProvider } from 'next-intl'
import { getMessages } from 'next-intl/server'
import { notFound } from 'next/navigation'
import type { Metadata, Viewport } from 'next'
import { routing } from '@/i18n/routing'
import { getCurrentUser } from '@/shared/auth/current-user'
import PostHogProvider from '@/shared/analytics/PostHogProvider'
import { ServiceWorkerRegistrar } from '@/shared/pwa/ServiceWorkerRegistrar'
import { Onest } from 'next/font/google'
import '../globals.css'

// Single cohesive type family across the whole app — a neutral-geometric sans
// with excellent Cyrillic coverage (sleek, premium, AI-native feel). Headlines
// reuse it at heavy weights + tight tracking via the `font-display` utility, so
// the system stays coherent instead of pairing two competing families.
// Cyrillic + latin-ext subsets are required for RU/ES locales.
const onest = Onest({
  subsets: ['latin', 'latin-ext', 'cyrillic'],
  variable: '--font-onest',
  display: 'swap',
})

// PWA + install metadata. Next emits the manifest link, apple-touch-icon, and
// the apple-mobile-web-app meta tags from these, enabling "Add to Home Screen".
export const metadata: Metadata = {
  applicationName: 'girlfriend.ai',
  title: {
    default: 'girlfriend.ai — AI Companion',
    template: '%s · girlfriend.ai',
  },
  description: 'Chat with your AI companion — anytime, anywhere.',
  manifest: '/manifest.webmanifest',
  appleWebApp: {
    capable: true,
    statusBarStyle: 'black-translucent',
    title: 'girlfriend.ai',
  },
  icons: {
    icon: [
      { url: '/icons/favicon-32.png', sizes: '32x32', type: 'image/png' },
      { url: '/icons/icon-192.png', sizes: '192x192', type: 'image/png' },
    ],
    apple: [{ url: '/icons/apple-touch-icon.png', sizes: '180x180', type: 'image/png' }],
  },
}

export const viewport: Viewport = {
  themeColor: '#0b0a10',
  // Let the app draw under the iOS status bar / home indicator when installed.
  viewportFit: 'cover',
}

type Props = {
  children: React.ReactNode
  params: Promise<{ locale: string }>
}

export default async function LocaleLayout({ children, params }: Props) {
  const { locale } = await params

  if (!routing.locales.includes(locale as (typeof routing.locales)[number])) {
    notFound()
  }

  const messages = await getMessages()
  const user = await getCurrentUser()
  const userId = user ? String(user.id) : undefined

  return (
    <html lang={locale} className={onest.variable}>
      <body>
        <NextIntlClientProvider messages={messages}>
          <PostHogProvider userId={userId}>{children}</PostHogProvider>
        </NextIntlClientProvider>
        <ServiceWorkerRegistrar />
      </body>
    </html>
  )
}
