import Alert from "@mui/material/Alert";
import Typography from "@mui/material/Typography";
import type { Metadata } from "next";

import { AuthCard } from "@/components/auth/AuthCard";
import { TextLink } from "@/components/links";

export const metadata: Metadata = { title: "Link problem" };

const MESSAGES: Record<string, string> = {
  otp_expired: "This link has expired or was already used.",
  unconfigured: "Accounts are not configured on this server.",
  missing_token: "The link is incomplete. Open it directly from the email.",
  bad_code_verifier: "Open the link in the same browser where you started.",
};

export default async function AuthErrorPage({ searchParams }: PageProps<"/auth/error">) {
  const { reason } = await searchParams;
  const key = typeof reason === "string" ? reason : "";
  return (
    <AuthCard title="That link did not work">
      <Alert severity="warning">{MESSAGES[key] ?? "The sign-in link could not be verified."}</Alert>
      <Typography sx={{ mt: 2 }}>
        <TextLink href="/forgot-password">Request a new reset link</TextLink> or <TextLink href="/sign-in">sign in</TextLink>.
      </Typography>
    </AuthCard>
  );
}
