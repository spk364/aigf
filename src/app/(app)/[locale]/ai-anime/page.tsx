import { CategoryCatalogPage } from '@/widgets/dashboard/CategoryCatalogPage'

type Props = {
  params: Promise<{ locale: string }>
}

export const metadata = {
  title: 'AI Anime — chat with anime characters',
  description:
    'Meet AI anime companions with rich personalities and stylized art. Pick a vibe, start a conversation, and bring your anime crush to life.',
}

export default async function AiAnimePage({ params }: Props) {
  const { locale } = await params
  return <CategoryCatalogPage locale={locale} category="anime" />
}
