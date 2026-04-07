import type { Metadata } from 'next'
import './globals.css'

export const metadata: Metadata = {
  title: 'Go & Study CRM',
}

export default function RootLayout({
  children,
}: {
  children: React.ReactNode
}) {
  return (
    <html lang="ru">
      <body style={{margin:0, padding:0, background:'#F4F3F8', fontFamily:"'Segoe UI', system-ui, sans-serif"}}>
        {children}
      </body>
    </html>
  )
}