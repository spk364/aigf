import { CategoryCatalogPage } from '@/widgets/dashboard/CategoryCatalogPage'

type Props = {
  params: Promise<{ locale: string }>
}

export const metadata = {
  title: 'AI Boyfriend — chat with your dream companion',
  description:
    'Talk to AI boyfriends with real personalities, photos, and voice. Pick a vibe, start a conversation, and design the partner you have in mind.',
}

export default async function AiBoyfriendPage({ params }: Props) {
  const { locale } = await params
  return <CategoryCatalogPage locale={locale} category="boys" />
}
