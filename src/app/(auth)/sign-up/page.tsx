import type { Metadata } from "next";
import { redirect } from "next/navigation";

import { AuthCard } from "@/components/auth/AuthCard";
import { ActionForm, FormField } from "@/components/forms/ActionForm";
import { TextLink } from "@/components/links";
import { SetupRequired } from "@/components/SetupRequired";
import { signUp } from "@/server/auth/actions";
import { getAuth } from "@/server/auth/session";

export const metadata: Metadata = { title: "Create account" };

export default async function SignUpPage() {
  const auth = await getAuth();
  if (auth.state === "unconfigured" || auth.state === "unreachable") return <SetupRequired feature="Creating an account" reason={auth.state} />;
  if (auth.state === "signed_in") redirect("/farms");
  return (
    <AuthCard
      title="Create account"
      intro="Create a free account to save your fields privately."
      footer={
        <span>
          Already have an account? <TextLink href="/sign-in">Sign in</TextLink>
        </span>
      }
    >
      <ActionForm action={signUp} submitLabel="Create account">
        <FormField name="email" label="Email" type="email" autoComplete="email" required fullWidth />
        <FormField name="password" label="Password" type="password" autoComplete="new-password" required fullWidth helperText="At least 8 characters" />
        <FormField name="confirm" label="Confirm password" type="password" autoComplete="new-password" required fullWidth />
      </ActionForm>
    </AuthCard>
  );
}
