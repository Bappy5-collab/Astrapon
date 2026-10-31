import Box from "@mui/material/Box";
import Container from "@mui/material/Container";
import Typography from "@mui/material/Typography";

import { color, elevation, radius, tokens } from "@/theme/tokens";

/** Field rows motif (original SVG) used beside sign-in forms. Decorative only. */
function RowsMotif() {
  return (
    <Box component="svg" viewBox="0 0 320 200" aria-hidden="true" sx={{ width: "100%", height: "auto", display: "block", mt: 4 }}>
      <defs>
        <clipPath id="fs-plot">
          <path d="M18 40 L210 14 L304 92 L250 186 L40 176 Z" />
        </clipPath>
      </defs>
      <path d="M18 40 L210 14 L304 92 L250 186 L40 176 Z" fill={tokens.forest[800]} />
      <g clipPath="url(#fs-plot)" stroke={tokens.forest[600]} strokeWidth="5">
        {Array.from({ length: 22 }, (_, i) => (
          <line key={i} x1={-40 + i * 18} y1="220" x2={60 + i * 18} y2="-20" />
        ))}
      </g>
      <path d="M150 28 L210 14 L304 92 L262 164 L170 120 Z" fill={tokens.lime[400]} opacity="0.22" />
      <path d="M18 40 L210 14 L304 92 L250 186 L40 176 Z" fill="none" stroke={tokens.lime[400]} strokeWidth="2.5" />
      <path d="M150 28 L262 164" stroke={tokens.lime[300]} strokeWidth="1.5" strokeDasharray="6 5" />
    </Box>
  );
}

export function AuthCard({ title, intro, children, footer }: { title: string; intro?: React.ReactNode; children: React.ReactNode; footer?: React.ReactNode }) {
  return (
    <Container maxWidth="md" sx={{ py: { xs: 4, md: 8 } }}>
      <Box sx={{ display: "grid", gridTemplateColumns: { xs: "1fr", md: "1fr 1.1fr" }, borderRadius: `${radius.lg}px`, overflow: "hidden", border: `1px solid ${color.line}`, boxShadow: elevation.raised, bgcolor: color.surfaceRaised }}>
        <Box sx={{ display: { xs: "none", md: "block" }, bgcolor: tokens.forest[900], color: tokens.neutral[100], p: 5 }}>
          <Typography variant="overline" sx={{ color: tokens.lime[400] }}>
            FieldShift
          </Typography>
          <Typography variant="h3" component="p" sx={{ mt: 1 }}>
            Your field, your records, private by default.
          </Typography>
          <Typography variant="body2" sx={{ mt: 2, color: tokens.neutral[300] }}>
            Boundaries, zones and crop history are stored in your own account. Database rules stop other users from reading or changing them.
          </Typography>
          <RowsMotif />
        </Box>
        <Box sx={{ p: { xs: 2.5, sm: 4, md: 5 } }}>
          <Typography variant="h4" component="h1" sx={{ color: color.forest }}>
            {title}
          </Typography>
          {intro && (
            <Typography color="text.secondary" sx={{ mt: 1, mb: 3 }}>
              {intro}
            </Typography>
          )}
          <Box sx={{ mt: intro ? 0 : 3 }}>{children}</Box>
          {footer && <Box sx={{ mt: 3, fontSize: "0.9375rem" }}>{footer}</Box>}
        </Box>
      </Box>
    </Container>
  );
}
