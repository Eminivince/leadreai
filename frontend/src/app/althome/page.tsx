import type { CSSProperties } from 'react'
import AltNav from '@/components/marketing/AltNav'
import AltFooter from '@/components/marketing/AltFooter'
import { altTokens } from '@/components/marketing/alt-tokens'

export default function AlthomePage() {
  return (
    <main style={altTokens as CSSProperties}>
      <AltNav />
      {/* sections will be added in subsequent tasks */}
      <AltFooter />
    </main>
  )
}
