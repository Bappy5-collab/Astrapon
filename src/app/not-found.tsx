import Container from "@mui/material/Container";
import Typography from "@mui/material/Typography";

import { ButtonLink } from "@/components/links";

export default function NotFound() {
  return (
    <Container maxWidth="sm" sx={{ py: 12 }}>
      <Typography variant="h3" component="h1">
        Page not found
      </Typography>
      <Typography color="text.secondary" sx={{ mt: 2 }}>
        This page does not exist, or it belongs to a part of Astrapon that has not been built yet.
      </Typography>
      <ButtonLink href="/" variant="contained" sx={{ mt: 4 }}>
        Back to overview
      </ButtonLink>
    </Container>
  );
}
