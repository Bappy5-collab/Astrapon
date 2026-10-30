"use client";

import Button from "@mui/material/Button";
import Container from "@mui/material/Container";
import Stack from "@mui/material/Stack";
import Typography from "@mui/material/Typography";
import NextLink from "next/link";
import { useEffect } from "react";

export default function RouteError({ error, reset }: { error: Error & { digest?: string }; reset: () => void }) {
  useEffect(() => {
    console.error("[FieldShift route error]", error.digest ?? error.message);
  }, [error]);

  return (
    <Container maxWidth="sm" sx={{ py: 12 }} role="alert">
      <Typography variant="h3" component="h1">
        Something went wrong on this page
      </Typography>
      <Typography color="text.secondary" sx={{ mt: 2 }}>
        No data was changed. You can try again, or return to the overview.
        {error.digest ? ` Reference: ${error.digest}` : null}
      </Typography>
      <Stack direction="row" spacing={1.5} sx={{ mt: 4 }}>
        <Button variant="contained" onClick={reset}>
          Try again
        </Button>
        <Button component={NextLink} href="/" variant="outlined">
          Overview
        </Button>
      </Stack>
    </Container>
  );
}
