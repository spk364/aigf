import { permanentRedirect } from 'next/navigation'

type Props = {
  params: Promise<{ locale: string }>
}

export default async function GuysRedirect({ params }: Props) {
  const { locale } = await params
  permanentRedirect(`/${locale}/ai-boyfriend`)
}
