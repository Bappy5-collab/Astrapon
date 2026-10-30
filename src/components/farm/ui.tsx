import Box from "@mui/material/Box";
import Breadcrumbs from "@mui/material/Breadcrumbs";
import Chip from "@mui/material/Chip";
import Typography from "@mui/material/Typography";

import { TextLink } from "@/components/links";
import { EVIDENCE_CLASS_INFO, type EvidenceClass } from "@/domain/provenance/evidence";
import { tokens } from "@/theme/tokens";

export function PageHeader({ crumbs, title, children }: { crumbs: { href: string; label: string }[]; title: string; children?: React.ReactNode }) {
  return (
    <Box sx={{ mb: 4 }}>
      <Breadcrumbs aria-label="Breadcrumb" sx={{ fontSize: "0.9rem" }}>
        {crumbs.map((c) => (
          <TextLink key={c.href} href={c.href} underline="hover" color="inherit">
            {c.label}
          </TextLink>
        ))}
        <Typography color="text.primary" sx={{ fontSize: "inherit" }}>
          {title}
        </Typography>
      </Breadcrumbs>
      <Typography variant="h3" component="h1" sx={{ mt: 1, color: tokens.forest[900], overflowWrap: "anywhere" }}>
        {title}
      </Typography>
      {children && <Box sx={{ mt: 1.5 }}>{children}</Box>}
    </Box>
  );
}

export function Section({ title, intro, children, id }: { title: string; intro?: React.ReactNode; children: React.ReactNode; id?: string }) {
  return (
    <Box component="section" id={id} aria-labelledby={id ? `${id}-h` : undefined} sx={{ p: { xs: 2, md: 3 }, mb: 3, borderRadius: 3, border: `1px solid ${tokens.neutral[300]}`, bgcolor: tokens.neutral[50], overflowWrap: "anywhere" }}>
      <Typography variant="h5" component="h2" id={id ? `${id}-h` : undefined}>
        {title}
      </Typography>
      {intro && (
        <Typography variant="body2" color="text.secondary" sx={{ mt: 0.5, mb: 2, maxWidth: 760 }}>
          {intro}
        </Typography>
      )}
      <Box sx={{ mt: intro ? 0 : 2 }}>{children}</Box>
    </Box>
  );
}

export function EvidenceChip({ evidenceClass }: { evidenceClass: EvidenceClass }) {
  const info = EVIDENCE_CLASS_INFO[evidenceClass];
  return <Chip size="small" variant="outlined" label={info.label} title={info.meaning} />;
}

export function Empty({ children }: { children: React.ReactNode }) {
  return (
    <Typography variant="body2" color="text.secondary" sx={{ fontStyle: "italic" }}>
      {children}
    </Typography>
  );
}

/** Simple accessible list of records with a delete control per row. */
export function RecordList({ items, label }: { items: { key: string; primary: React.ReactNode; secondary?: React.ReactNode; action?: React.ReactNode }[]; label: string }) {
  return (
    <Box component="ul" aria-label={label} sx={{ listStyle: "none", p: 0, m: 0, mb: 2 }}>
      {items.map((i) => (
        <Box component="li" key={i.key} sx={{ display: "flex", gap: 2, alignItems: "flex-start", justifyContent: "space-between", py: 1.25, borderBottom: `1px solid ${tokens.neutral[200]}` }}>
          <Box sx={{ minWidth: 0 }}>
            {/* div, not p: rows may contain chips, <details> and <pre>, which are invalid inside <p>. */}
            <Typography component="div" sx={{ fontWeight: 600 }}>
              {i.primary}
            </Typography>
            {i.secondary && (
              <Typography component="div" variant="body2" color="text.secondary">
                {i.secondary}
              </Typography>
            )}
          </Box>
          {i.action && <Box sx={{ flexShrink: 0 }}>{i.action}</Box>}
        </Box>
      ))}
    </Box>
  );
}
