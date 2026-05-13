'use client'

import { DashboardHero } from '@/app/client/DashboardHero'
import { CLIENT_CTX } from '@/app/client/mock-data'
import type { TimelineStage } from '@/app/client/mock-data'

interface Props {
  parentName: string
  childFirstName: string
  childFullName: string
  stages: TimelineStage[]
}

export function DemoHero({ parentName, childFirstName, childFullName, stages }: Props) {
  return (
    <DashboardHero
      ctx={{
        ...CLIENT_CTX,
        parentName,
        childFirstName,
        childFullName,
      }}
      stages={stages}
    />
  )
}
