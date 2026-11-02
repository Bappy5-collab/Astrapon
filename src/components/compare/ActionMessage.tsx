"use client";

import Alert from "@mui/material/Alert";
import Button from "@mui/material/Button";
import NextLink from "next/link";
import { usePathname } from "next/navigation";

import { useT } from "@/lib/i18n/I18nProvider";

/** Result of a user action; `auth` means the session ended and sign-in should return here. */
export type UiMessage = { ok: boolean; text: string; auth?: boolean; href?: string; hrefLabel?: string };

export function ActionMessage({ message }: { message: UiMessage | null }) {
  const t = useT();
  const path = usePathname();
  if (!message) return null;
  if (message.auth)
    return (
      <Alert
        severity="warning"
        sx={{ mt: 1.5 }}
        action={
          <Button component={NextLink} href={`/sign-in?next=${encodeURIComponent(path)}`} color="inherit" size="small">
            {t("sim.err.signInLink")}
          </Button>
        }
      >
        {t("sim.err.signIn")}
      </Alert>
    );
  return (
    <Alert
      severity={message.ok ? "success" : "error"}
      sx={{ mt: 1.5 }}
      action={
        message.href ? (
          <Button component={NextLink} href={message.href} color="inherit" size="small">
            {message.hrefLabel}
          </Button>
        ) : undefined
      }
    >
      {message.text}
    </Alert>
  );
}

/** Maps a server action failure (or a thrown network error) to a message the user can act on. */
export function toUiMessage(r: { ok: boolean; message: string; auth?: boolean } | null, fallback: string): UiMessage {
  if (!r) return { ok: false, text: fallback };
  return { ok: r.ok, text: r.message, auth: r.auth };
}
