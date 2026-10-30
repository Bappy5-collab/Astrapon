import Alert from "@mui/material/Alert";
import AlertTitle from "@mui/material/AlertTitle";
import Container from "@mui/material/Container";

import { TextLink } from "@/components/links";

/**
 * Honest states for features that need Supabase: not configured, or configured but unreachable
 * right now. Never a pretend sign-in.
 */
export function SetupRequired({ feature, reason = "unconfigured" }: { feature: string; reason?: "unconfigured" | "unreachable" }) {
  return (
    <Container maxWidth="sm" sx={{ py: 8 }}>
      {reason === "unreachable" ? (
        <Alert severity="error" variant="outlined">
          <AlertTitle>Account service not reachable</AlertTitle>
          {feature} needs the Supabase project, which did not respond in time. Nothing was loaded or changed. Check your internet
          connection and reload the page.
        </Alert>
      ) : (
        <Alert severity="warning" variant="outlined">
          <AlertTitle>Accounts are not configured</AlertTitle>
          {feature} needs a Supabase project. Nothing has been saved and no one is signed in. See{" "}
          <TextLink href="/setup">Setup</TextLink> for the environment variables to add.
        </Alert>
      )}
    </Container>
  );
}
