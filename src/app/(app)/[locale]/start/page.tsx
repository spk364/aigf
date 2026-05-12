import { redirect } from 'next/navigation'

type Props = {
  params: Promise<{ locale: string }>
}

// /start is kept as a stable SEO/CTA entry-point but now defers to /builder,
// which owns the draft list + start-new flow. Used to be a guest onboarding
// wizard, which created confusion with the authoritative /builder page.
export default async function StartPage({ params }: Props) {
  const { locale } = await params
  redirect(`/${locale}/builder`)
}
