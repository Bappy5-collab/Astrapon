import type { Metadata } from "next";

import { AuthCard } from "@/components/auth/AuthCard";
import { ActionForm, FormField } from "@/components/forms/ActionForm";
import { TextLink } from "@/components/links";
import { SetupRequired } from "@/components/SetupRequired";
import { updatePassword } from "@/server/auth/actions";
import { requireUser } from "@/server/auth/session";

export const metadata: Metadata = { title: "Choose a new password" };

export default async function UpdatePasswordPage() {
  const user = await requireUser("/account/update-password");
  if (user.state !== "signed_in") return <SetupRequired feature="Changing your password" reason={user.state} />;
  return (
    <AuthCard title="Choose a new password" footer={<TextLink href="/farms">Go to your farms</TextLink>}>
      <ActionForm action={updatePassword} submitLabel="Update password">
        <FormField name="password" label="New password" type="password" autoComplete="new-password" required fullWidth helperText="At least 8 characters" />
        <FormField name="confirm" label="Confirm new password" type="password" autoComplete="new-password" required fullWidth />
      </ActionForm>
    </AuthCard>
  );
}
