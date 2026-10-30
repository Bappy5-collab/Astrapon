import Button from "@mui/material/Button";
import Stack from "@mui/material/Stack";

/**
 * Server-action delete as a plain form, so it works without client JavaScript. With
 * `confirmLabel`, a required checkbox must be ticked first (used for cascading deletes).
 */
export function DeleteButton({ action, label, confirmLabel }: { action: () => Promise<void>; label: string; confirmLabel?: string }) {
  return (
    <form action={action}>
      <Stack direction="row" spacing={1.5} sx={{ alignItems: "center", flexWrap: "wrap" }}>
        {confirmLabel && (
          <label style={{ display: "inline-flex", gap: 6, alignItems: "center", fontSize: "0.9rem" }}>
            <input type="checkbox" name="confirm" required />
            {confirmLabel}
          </label>
        )}
        <Button type="submit" size="small" color="error" variant={confirmLabel ? "outlined" : "text"} aria-label={label}>
          Delete
        </Button>
      </Stack>
    </form>
  );
}
