"use client";

import Alert from "@mui/material/Alert";
import Box from "@mui/material/Box";
import Button from "@mui/material/Button";
import CircularProgress from "@mui/material/CircularProgress";
import Dialog from "@mui/material/Dialog";
import DialogActions from "@mui/material/DialogActions";
import DialogContent from "@mui/material/DialogContent";
import DialogTitle from "@mui/material/DialogTitle";
import Typography from "@mui/material/Typography";

import type { ChangeLine } from "@/domain/workspace/workspace";
import { useT } from "@/lib/i18n/I18nProvider";
import { color, tokens } from "@/theme/tokens";

const KIND_LABEL: Record<ChangeLine["kind"], string> = { boundary: "Boundary", zone_new: "New zone", zone_edit: "Zone", zone_delete: "Delete", crop: "Crop" };

export function SaveDialog({
  open,
  changes,
  blockers,
  saving,
  error,
  sample,
  onCancel,
  onConfirm,
}: {
  open: boolean;
  changes: ChangeLine[];
  blockers: string[];
  saving: boolean;
  error: string | null;
  sample: boolean;
  onCancel: () => void;
  onConfirm: () => void;
}) {
  const t = useT();
  return (
    <Dialog open={open} onClose={saving ? undefined : onCancel} aria-labelledby="save-title" fullWidth maxWidth="sm">
      <DialogTitle id="save-title">{t("ws.confirmSave")}</DialogTitle>
      <DialogContent>
        <Typography variant="body2" color="text.secondary" sx={{ mb: 1.5 }}>
          {sample
            ? "These changes are stored only in this browser for the sample. Nothing is sent to a server."
            : "These changes are saved to your private account together. If any one fails, none are saved. Drawn boundaries and crops are recorded as farmer reports."}
        </Typography>
        <Box component="ul" sx={{ listStyle: "none", p: 0, m: 0, display: "grid", gap: 0.75 }}>
          {changes.map((c, i) => (
            <Box component="li" key={i} sx={{ display: "flex", gap: 1.25, alignItems: "baseline" }}>
              <Typography variant="caption" sx={{ flexShrink: 0, minWidth: 72, fontWeight: 700, color: c.kind === "zone_delete" ? color.danger : tokens.forest[600] }}>
                {KIND_LABEL[c.kind]}
              </Typography>
              <Typography variant="body2">{c.text}</Typography>
            </Box>
          ))}
        </Box>
        {blockers.map((b) => (
          <Alert key={b} severity="error" sx={{ mt: 2 }}>
            {b}
          </Alert>
        ))}
        {error && (
          <Alert severity="error" sx={{ mt: 2 }} role="alert">
            {error}
          </Alert>
        )}
      </DialogContent>
      <DialogActions sx={{ px: 3, pb: 2 }}>
        <Button onClick={onCancel} disabled={saving}>
          {t("ws.cancel")}
        </Button>
        <Button variant="contained" onClick={onConfirm} disabled={saving || blockers.length > 0 || changes.length === 0} startIcon={saving ? <CircularProgress size={16} color="inherit" /> : undefined}>
          {saving ? "Saving…" : "Confirm and save"}
        </Button>
      </DialogActions>
    </Dialog>
  );
}
