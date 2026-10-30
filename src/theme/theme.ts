"use client";

import { createTheme } from "@mui/material/styles";

import { tokens } from "./tokens";

const display = "var(--font-display), Georgia, serif";
const body = "var(--font-body), system-ui, -apple-system, Segoe UI, sans-serif";

export const theme = createTheme({
  cssVariables: true,
  palette: {
    mode: "light",
    primary: { main: tokens.forest[800], light: tokens.forest[600], dark: tokens.forest[950], contrastText: tokens.neutral[50] },
    secondary: { main: tokens.lime[400], light: tokens.lime[300], dark: tokens.lime[700], contrastText: tokens.forest[950] },
    background: { default: tokens.neutral[100], paper: tokens.neutral[50] },
    text: { primary: tokens.neutral[900], secondary: tokens.neutral[700] },
    divider: tokens.neutral[300],
    warning: { main: "#B7791F" },
    error: { main: tokens.clay },
  },
  shape: { borderRadius: 10 },
  typography: {
    fontFamily: body,
    h1: { fontFamily: display, fontWeight: 600, fontSize: "clamp(2.4rem, 5vw, 4rem)", lineHeight: 1.05, letterSpacing: "-0.02em" },
    h2: { fontFamily: display, fontWeight: 600, fontSize: "clamp(1.9rem, 3.5vw, 2.6rem)", lineHeight: 1.1, letterSpacing: "-0.015em" },
    h3: { fontFamily: display, fontWeight: 600, fontSize: "1.6rem", lineHeight: 1.2 },
    h4: { fontWeight: 700, fontSize: "1.25rem", lineHeight: 1.3 },
    h5: { fontWeight: 700, fontSize: "1.05rem" },
    h6: { fontWeight: 700, fontSize: "0.95rem" },
    subtitle1: { fontSize: "1.15rem", lineHeight: 1.6 },
    body1: { fontSize: "1rem", lineHeight: 1.65 },
    body2: { fontSize: "0.9rem", lineHeight: 1.6 },
    overline: { fontWeight: 700, letterSpacing: "0.14em", fontSize: "0.72rem" },
    button: { textTransform: "none", fontWeight: 600, letterSpacing: 0 },
  },
  components: {
    MuiButton: {
      defaultProps: { disableElevation: true },
      styleOverrides: { root: { borderRadius: 999, paddingInline: 20 } },
    },
    MuiChip: { styleOverrides: { root: { fontWeight: 600 } } },
    MuiPaper: { styleOverrides: { root: { backgroundImage: "none" } } },
    MuiCard: {
      defaultProps: { variant: "outlined" },
      styleOverrides: { root: { borderColor: tokens.neutral[300] } },
    },
    MuiLink: { defaultProps: { underline: "hover" } },
    MuiCssBaseline: {
      styleOverrides: {
        "::selection": { background: tokens.lime[300], color: tokens.forest[950] },
        ":focus-visible": { outline: `3px solid ${tokens.lime[500]}`, outlineOffset: 2 },
      },
    },
  },
});
