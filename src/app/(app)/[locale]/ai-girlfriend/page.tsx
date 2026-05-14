import { CategoryCatalogPage } from '@/widgets/dashboard/CategoryCatalogPage'

type Props = {
  params: Promise<{ locale: string }>
}

export const metadata = {
  title: 'AI Girlfriend — chat with your dream companion',
  description:
    'Talk to AI girlfriends with real personalities, photos, and voice. Pick a vibe, start a conversation, and design your dream companion.',
}

export default async function AiGirlfriendPage({ params }: Props) {
  const { locale } = await params
  return <CategoryCatalogPage locale={locale} category="girls" />
}
