import { NextResponse } from 'next/server'
import { logoutAction } from '@/features/auth/actions/logout'

export async function POST(
  _req: Request,
  { params }: { params: Promise<{ locale: string }> },
) {
  const { locale } = await params
  await logoutAction()
  return NextResponse.redirect(new URL(`/${locale}/login`, process.env.NEXT_PUBLIC_APP_URL ?? 'http://localhost:3000'))
}
