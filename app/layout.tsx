import './globals.css'
import type { ReactNode } from 'react'
import { DM_Mono, DM_Sans, Instrument_Serif } from 'next/font/google'
import { Providers } from './providers'

// next/font: self-hosts the files at build time, no FOIT, no extra HTTP
// to fonts.googleapis.com at request time.
const dmSans = DM_Sans({
  subsets: ['latin'],
  display: 'swap',
  variable: '--font-aloma-sans',
})

const instrumentSerif = Instrument_Serif({
  subsets: ['latin'],
  weight: '400',
  display: 'swap',
  variable: '--font-aloma-display',
})

const dmMono = DM_Mono({
  subsets: ['latin'],
  weight: ['300', '400', '500'],
  display: 'swap',
  variable: '--font-aloma-mono',
})

export const metadata = {
  title: process.env.WORKTREE_NAME ? `aloma · ${process.env.WORKTREE_NAME}` : 'aloma',
}

export default function RootLayout({ children }: { children: ReactNode }) {
  return (
    <html
      lang="en"
      className={`${dmSans.variable} ${instrumentSerif.variable} ${dmMono.variable}`}
    >
      <body>
        <Providers>{children}</Providers>
      </body>
    </html>
  )
}
