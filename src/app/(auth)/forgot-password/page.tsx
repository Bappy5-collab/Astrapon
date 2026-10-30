import type { Metadata } from "next";

import { AuthCard } from "@/components/auth/AuthCard";
import { ActionForm, FormField } from "@/components/forms/ActionForm";
import { TextLink } from "@/components/links";
import { SetupRequired } from "@/components/SetupRequired";
import { requestPasswordReset } from "@/server/auth/actions";
import { getAuth } from "@/server/auth/session";

export const metadata: Metadata = { title: "Reset password" };

export default async function ForgotPasswordPage() {
  const auth = await getAuth();
  if (auth.state === "unconfigured" || auth.state === "unreachable") return <SetupRequired feature="Password reset" reason={auth.state} />;
  return (
    <AuthCard
      title="Reset password"
      intro="Enter your account email and we will send a link to choose a new password."
      footer={<TextLink href="/sign-in">Back to sign in</TextLink>}
    >
      <ActionForm action={requestPasswordReset} submitLabel="Send reset link">
        <FormField name="email" label="Email" type="email" autoComplete="email" required fullWidth />
      </ActionForm>
    </AuthCard>
  );
}
