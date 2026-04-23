'use client'

import { useEffect } from 'react'
import { initPostHogClient, identifyUser } from './posthog-client'

type Props = {
  userId?: string
  children: React.ReactNode
}

export default function PostHogProvider({ userId, children }: Props) {
  useEffect(() => {
    initPostHogClient()
    if (userId) {
      identifyUser(userId)
    }
  }, [userId])

  return <>{children}</>
}
