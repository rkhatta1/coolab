import { ClerkProvider } from "@clerk/nextjs"

import "@workspace/ui/globals.css"
import { ThemeProvider } from "@/components/theme-provider"
import { ConvexClientProvider } from "@/app/convex-client-provider"

export default function RootLayout({
  children,
}: Readonly<{
  children: React.ReactNode
}>) {
  return (
    <html
      lang="en"
      suppressHydrationWarning
      className="font-sans antialiased"
    >
      <body>
        <ClerkProvider>
          <ConvexClientProvider>
            <ThemeProvider>{children}</ThemeProvider>
          </ConvexClientProvider>
        </ClerkProvider>
      </body>
    </html>
  )
}
