import CssBaseline from "@mui/material/CssBaseline";
import { ThemeProvider } from "@mui/material/styles";
import { AppRouterCacheProvider } from "@mui/material-nextjs/v16-appRouter";
import type { Metadata, Viewport } from "next";
import { Fraunces, Manrope } from "next/font/google";

import { AppShell } from "@/components/shell/AppShell";
import { theme } from "@/theme/theme";

const display = Fraunces({ subsets: ["latin"], display: "swap", variable: "--font-display", axes: ["opsz"] });
const body = Manrope({ subsets: ["latin"], display: "swap", variable: "--font-body" });

export const metadata: Metadata = {
  title: { default: "FieldShift", template: "%s · FieldShift" },
  description:
    "Compare crop rotation options for your field against environmental evidence, water limits, and your priorities, then review the tradeoffs locally.",
};

export const viewport: Viewport = { themeColor: "#12291D" };

export default function RootLayout({ children }: { children: React.ReactNode }) {
  return (
    <html lang="en" className={`${display.variable} ${body.variable}`}>
      <body>
        <AppRouterCacheProvider>
          <ThemeProvider theme={theme}>
            <CssBaseline />
            <AppShell>{children}</AppShell>
          </ThemeProvider>
        </AppRouterCacheProvider>
      </body>
    </html>
  );
}
