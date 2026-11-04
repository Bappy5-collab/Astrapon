import ExpandMoreRoundedIcon from "@mui/icons-material/ExpandMoreRounded";
import Box from "@mui/material/Box";
import Breadcrumbs from "@mui/material/Breadcrumbs";
import Chip from "@mui/material/Chip";
import Stack from "@mui/material/Stack";
import Typography from "@mui/material/Typography";

import { TextLink } from "@/components/links";
import { EVIDENCE_CLASS_INFO, type EvidenceClass } from "@/domain/provenance/evidence";
import { color, elevation, radius, tokens } from "@/theme/tokens";

/**
 * Page title block. `eyebrow` is a short context line above the title, `actions` sits beside the
 * title on wide screens and under it on phones.
 */
export function PageHeader({
  crumbs,
  title,
  eyebrow,
  subtitle,
  actions,
  children,
}: {
  crumbs: { href: string; label: string }[];
  title: string;
  eyebrow?: React.ReactNode;
  subtitle?: React.ReactNode;
  actions?: React.ReactNode;
  children?: React.ReactNode;
}) {
  return (
    <Box sx={{ mb: { xs: 3, md: 4 } }}>
      {crumbs.length > 0 && (
        <Breadcrumbs aria-label="Breadcrumb" sx={{ fontSize: "0.875rem", mb: 1.5, "& a": { color: color.inkMuted } }}>
          {crumbs.map((c) => (
            <TextLink key={c.href} href={c.href} underline="hover" color="inherit">
              {c.label}
            </TextLink>
          ))}
          <Typography color="text.primary" sx={{ fontSize: "inherit", fontWeight: 600 }}>
            {title}
          </Typography>
        </Breadcrumbs>
      )}
      <Stack direction={{ xs: "column", md: "row" }} spacing={2} sx={{ alignItems: { md: "flex-end" }, justifyContent: "space-between" }}>
        <Box sx={{ minWidth: 0 }}>
          {eyebrow && (
            <Typography variant="overline" component="p" sx={{ color: tokens.forest[500], fontWeight: 700, letterSpacing: "0.08em", lineHeight: 1.6 }}>
              {eyebrow}
            </Typography>
          )}
          <Typography variant="h3" component="h1" sx={{ color: tokens.forest[900], overflowWrap: "anywhere", fontSize: { xs: "1.9rem", md: "2.4rem" } }}>
            {title}
          </Typography>
          {subtitle && (
            <Typography color="text.secondary" sx={{ mt: 1, maxWidth: 720, fontSize: { md: "1.05rem" } }}>
              {subtitle}
            </Typography>
          )}
        </Box>
        {actions && (
          <Stack direction="row" spacing={1.5} useFlexGap sx={{ flexShrink: 0, flexWrap: "wrap" }}>
            {actions}
          </Stack>
        )}
      </Stack>
      {children && <Box sx={{ mt: 1.5 }}>{children}</Box>}
    </Box>
  );
}

/** Round badge with an icon or a step number, used in section headers. */
function Badge({ icon, step, tone }: { icon?: React.ReactNode; step?: number; tone: "default" | "danger" }) {
  if (!icon && step === undefined) return null;
  return (
    <Box
      aria-hidden
      sx={{
        width: 40,
        height: 40,
        flexShrink: 0,
        borderRadius: "12px",
        display: "grid",
        placeItems: "center",
        bgcolor: tone === "danger" ? "#F6DED6" : tokens.lime[200],
        color: tone === "danger" ? tokens.clay : tokens.forest[800],
        fontWeight: 700,
        fontSize: "1.05rem",
        "& svg": { fontSize: 22 },
      }}
    >
      {icon ?? step}
    </Box>
  );
}

/**
 * A card section. `step` or `icon` adds a badge; `collapsible` renders it as a native
 * <details> (works without JavaScript and in server components), closed unless `defaultOpen`.
 */
export function Section({
  title,
  intro,
  children,
  id,
  icon,
  step,
  aside,
  collapsible = false,
  defaultOpen = false,
  tone = "default",
}: {
  title: string;
  intro?: React.ReactNode;
  children: React.ReactNode;
  id?: string;
  icon?: React.ReactNode;
  step?: number;
  /** Small status shown at the right of the header (e.g. a chip). */
  aside?: React.ReactNode;
  collapsible?: boolean;
  defaultOpen?: boolean;
  tone?: "default" | "danger";
}) {
  const header = (
    <Stack direction="row" spacing={1.75} sx={{ alignItems: "flex-start", minWidth: 0, flexGrow: 1 }}>
      <Badge icon={icon} step={step} tone={tone} />
      <Box sx={{ minWidth: 0, flexGrow: 1, pt: icon || step !== undefined ? 0.25 : 0 }}>
        <Stack direction="row" spacing={1} sx={{ alignItems: "center", flexWrap: "wrap", rowGap: 0.5 }}>
          <Typography variant="h5" component="h2" id={id ? `${id}-h` : undefined} sx={{ fontSize: { xs: "1.2rem", md: "1.3rem" }, color: tone === "danger" ? tokens.clay : undefined }}>
            {title}
          </Typography>
          {aside}
        </Stack>
        {intro && (
          <Typography variant="body2" color="text.secondary" component="div" sx={{ mt: 0.5, maxWidth: 760 }}>
            {intro}
          </Typography>
        )}
      </Box>
    </Stack>
  );
  const card = {
    mb: 2.5,
    borderRadius: `${radius.lg + 2}px`,
    border: `1px solid ${tone === "danger" ? "#E9C3B7" : color.line}`,
    bgcolor: color.surfaceRaised,
    boxShadow: elevation.raised,
    overflowWrap: "anywhere",
    scrollMarginTop: 88,
  } as const;
  if (collapsible)
    return (
      <Box component="details" id={id} open={defaultOpen || undefined} aria-labelledby={id ? `${id}-h` : undefined} sx={{ ...card, "&[open] .chev": { transform: "rotate(180deg)" } }}>
        <Box
          component="summary"
          sx={{
            p: { xs: 2, md: 3 },
            cursor: "pointer",
            listStyle: "none",
            display: "flex",
            gap: 1,
            alignItems: "flex-start",
            borderRadius: `${radius.lg + 2}px`,
            "&::-webkit-details-marker": { display: "none" },
            "&:hover": { bgcolor: color.surface },
            "&:focus-visible": { outline: `2px solid ${color.focus}`, outlineOffset: 2 },
          }}
        >
          {header}
          <ExpandMoreRoundedIcon className="chev" sx={{ mt: 1, color: color.inkMuted, transition: "transform 160ms" }} />
        </Box>
        <Box sx={{ px: { xs: 2, md: 3 }, pb: { xs: 2, md: 3 } }}>{children}</Box>
      </Box>
    );
  return (
    <Box component="section" id={id} aria-labelledby={id ? `${id}-h` : undefined} sx={{ ...card, p: { xs: 2, md: 3 } }}>
      {header}
      <Box sx={{ mt: 2.5 }}>{children}</Box>
    </Box>
  );
}

/** Small "More details" disclosure for optional inputs inside a form (closed controls still submit). */
export function More({ label = "More details (optional)", children, open }: { label?: string; children: React.ReactNode; open?: boolean }) {
  return (
    <Box component="details" open={open || undefined} sx={{ width: "100%", "&[open] > summary .chev": { transform: "rotate(180deg)" } }}>
      <Box
        component="summary"
        sx={{
          cursor: "pointer",
          listStyle: "none",
          display: "inline-flex",
          alignItems: "center",
          gap: 0.5,
          fontWeight: 600,
          fontSize: "0.9rem",
          color: tokens.forest[600],
          py: 0.5,
          "&::-webkit-details-marker": { display: "none" },
          "&:focus-visible": { outline: `2px solid ${color.focus}`, outlineOffset: 2, borderRadius: 1 },
        }}
      >
        {label}
        <ExpandMoreRoundedIcon className="chev" fontSize="small" sx={{ transition: "transform 160ms" }} />
      </Box>
      <Stack direction={{ xs: "column", md: "row" }} spacing={2} useFlexGap sx={{ flexWrap: "wrap", mt: 1.5 }}>
        {children}
      </Stack>
    </Box>
  );
}

export function EvidenceChip({ evidenceClass }: { evidenceClass: EvidenceClass }) {
  const info = EVIDENCE_CLASS_INFO[evidenceClass];
  return <Chip size="small" variant="outlined" label={info.label} title={info.meaning} />;
}

/** Status chip for section headers: done (lime) or to-do (neutral). */
export function StatusChip({ done, label }: { done: boolean; label: string }) {
  return <Chip size="small" label={label} sx={{ height: 22, fontWeight: 700, bgcolor: done ? tokens.lime[200] : tokens.neutral[200], color: done ? tokens.forest[900] : color.inkMuted }} />;
}

export function Empty({ children }: { children: React.ReactNode }) {
  return (
    <Box sx={{ p: 2, mb: 2, borderRadius: `${radius.md}px`, border: `1px dashed ${color.lineStrong}`, bgcolor: color.surface }}>
      <Typography variant="body2" color="text.secondary">
        {children}
      </Typography>
    </Box>
  );
}

/** Simple accessible list of records with a delete control per row. */
export function RecordList({ items, label }: { items: { key: string; primary: React.ReactNode; secondary?: React.ReactNode; action?: React.ReactNode }[]; label: string }) {
  return (
    <Box component="ul" aria-label={label} sx={{ listStyle: "none", p: 0, m: 0, mb: 2.5, border: `1px solid ${color.line}`, borderRadius: `${radius.md}px`, overflow: "hidden" }}>
      {items.map((i) => (
        <Box
          component="li"
          key={i.key}
          sx={{ display: "flex", gap: 2, alignItems: "center", justifyContent: "space-between", px: 2, py: 1.5, bgcolor: color.surfaceRaised, "& + li": { borderTop: `1px solid ${tokens.neutral[200]}` } }}
        >
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
