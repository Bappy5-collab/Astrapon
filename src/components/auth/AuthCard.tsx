import Box from "@mui/material/Box";
import Container from "@mui/material/Container";
import Typography from "@mui/material/Typography";

import { tokens } from "@/theme/tokens";

export function AuthCard({ title, intro, children, footer }: { title: string; intro?: React.ReactNode; children: React.ReactNode; footer?: React.ReactNode }) {
  return (
    <Container maxWidth="xs" sx={{ py: { xs: 5, md: 8 } }}>
      <Box sx={{ p: { xs: 2.5, sm: 4 }, borderRadius: 3, border: `1px solid ${tokens.neutral[300]}`, bgcolor: tokens.neutral[50] }}>
        <Typography variant="h4" component="h1" sx={{ color: tokens.forest[900] }}>
          {title}
        </Typography>
        {intro && (
          <Typography color="text.secondary" sx={{ mt: 1, mb: 3 }}>
            {intro}
          </Typography>
        )}
        <Box sx={{ mt: intro ? 0 : 3 }}>{children}</Box>
        {footer && <Box sx={{ mt: 3, fontSize: "0.9rem" }}>{footer}</Box>}
      </Box>
    </Container>
  );
}
