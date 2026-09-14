import type { Metadata } from "next";
import type { CSSProperties } from "react";
import { Geist_Mono, Inter } from "next/font/google";
import "./globals.css";
import { SidebarProvider } from "@/components/ui/sidebar";
import { AppSidebar } from "@/components/app-sidebar";
import { Toaster } from "@/components/ui/sonner";
import { ThemeProvider } from "@/components/theme-provider";
import { GlobalUploadIndicator } from "@/components/global-upload-indicator";

const inter = Inter({
  variable: "--font-geist-sans",
  subsets: ["latin"],
});

const geistMono = Geist_Mono({
  variable: "--font-geist-mono",
  subsets: ["latin"],
});

export const metadata: Metadata = {
  title: "BuildLens · Document Workspace",
  description:
    "Enterprise document intelligence—chat with your PDFs using grounded, cited answers.",
};

export default function RootLayout({
  children,
}: Readonly<{
  children: React.ReactNode;
}>) {
  return (
    <html lang="en" suppressHydrationWarning>
      <body
        className={`${inter.variable} ${geistMono.variable} antialiased`}
      >
        <ThemeProvider attribute="class" defaultTheme="system" enableSystem>
          <SidebarProvider
            style={
              {
                "--sidebar-width": "18rem",
              } as CSSProperties
            }
          >
            <AppSidebar />
            {children}
          </SidebarProvider>

          <GlobalUploadIndicator />
          <Toaster />
        </ThemeProvider>
      </body>
    </html>
  );
}
