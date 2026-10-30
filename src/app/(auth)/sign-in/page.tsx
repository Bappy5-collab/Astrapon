import Alert from "@mui/material/Alert";
import Stack from "@mui/material/Stack";
import type { Metadata } from "next";
import { redirect } from "next/navigation";

import { AuthCard } from "@/components/auth/AuthCard";
import { ActionForm, FormField } from "@/components/forms/ActionForm";
import { TextLink } from "@/components/links";
import { SetupRequired } from "@/components/SetupRequired";
import { signIn } from "@/server/auth/actions";
import { getAuth, safeNextPath } from "@/server/auth/session";

export const metadata: Metadata = { title: "Sign in" };

export default async function SignInPage({ searchParams }: PageProps<"/sign-in">) {
  const params = await searchParams;
  const next = safeNextPath(typeof params.next === "string" ? params.next : null);
  const auth = await getAuth();
  if (auth.state === "unconfigured" || auth.state === "unreachable") return <SetupRequired feature="Signing in" reason={auth.state} />;
  if (auth.state === "signed_in") redirect(next);
  return (
    <AuthCard
      title="Sign in"
      intro="Your farms, fields and scenarios are private to your account."
      footer={
        <Stack spacing={1}>
          <TextLink href="/forgot-password">Forgot your password?</TextLink>
          <span>
            New here? <TextLink href="/sign-up">Create an account</TextLink>
          </span>
        </Stack>
      }
    >
      {params.signed_out === "1" && (
        <Alert severity="info" sx={{ mb: 2 }}>
          You have signed out.
        </Alert>
      )}
      <ActionForm action={signIn} submitLabel="Sign in">
        <input type="hidden" name="next" value={next} />
        <FormField name="email" label="Email" type="email" autoComplete="email" required fullWidth />
        <FormField name="password" label="Password" type="password" autoComplete="current-password" required fullWidth />
      </ActionForm>
    </AuthCard>
  );
}
