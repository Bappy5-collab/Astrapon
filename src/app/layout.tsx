import CssBaseline from "@mui/material/CssBaseline";
import { ThemeProvider } from "@mui/material/styles";
import { AppRouterCacheProvider } from "@mui/material-nextjs/v16-appRouter";
import type { Metadata, Viewport } from "next";
import { Fraunces, Manrope, Noto_Sans_Bengali, Noto_Serif_Bengali } from "next/font/google";

import { AppShell } from "@/components/shell/AppShell";
import { I18nProvider } from "@/lib/i18n/I18nProvider";
import { getLocale } from "@/lib/i18n/server";
import { theme } from "@/theme/theme";
import { tokens } from "@/theme/tokens";

const display = Fraunces({ subsets: ["latin"], display: "swap", variable: "--font-display", axes: ["opsz"] });
const body = Manrope({ subsets: ["latin"], display: "swap", variable: "--font-body" });
// Bengali faces sit after the Latin faces in each stack, so Bangla glyphs render in a matching weight and size.
const bnSans = Noto_Sans_Bengali({ subsets: ["bengali"], display: "swap", variable: "--font-bn-sans", weight: ["400", "500", "600", "700"] });
const bnSerif = Noto_Serif_Bengali({ subsets: ["bengali"], display: "swap", variable: "--font-bn-serif", weight: ["500", "600"] });

export const metadata: Metadata = {
  title: { default: "Astrapon", template: "%s · Astrapon" },
  description:
    "Draw your field, record what you grew, and compare crop rotation options against environmental evidence, water limits and your priorities.",
};

export const viewport: Viewport = { themeColor: tokens.forest[900] };

export default async function RootLayout({ children }: { children: React.ReactNode }) {
  const locale = await getLocale();
  return (
    <html lang={locale} className={`${display.variable} ${body.variable} ${bnSans.variable} ${bnSerif.variable}`}>
      <body>
        <AppRouterCacheProvider>
          <ThemeProvider theme={theme}>
            <CssBaseline />
            <I18nProvider locale={locale}>
              <AppShell>{children}</AppShell>
            </I18nProvider>
          </ThemeProvider>
        </AppRouterCacheProvider>
      </body>
    </html>
  );
}
