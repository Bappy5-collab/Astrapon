"use client";

import { createTheme } from "@mui/material/styles";

import { color, elevation, motion, radius, tokens } from "./tokens";

// Latin faces first; Bengali glyphs fall through to the Noto Bengali faces in the same stack.
const display = "var(--font-display), var(--font-bn-serif), Georgia, serif";
const body = "var(--font-body), var(--font-bn-sans), system-ui, -apple-system, 'Segoe UI', sans-serif";

export const theme = createTheme({
  cssVariables: true,
  palette: {
    mode: "light",
    primary: { main: tokens.forest[800], light: tokens.forest[500], dark: tokens.forest[950], contrastText: tokens.neutral[50] },
    secondary: { main: tokens.lime[400], light: tokens.lime[300], dark: tokens.lime[600], contrastText: tokens.forest[950] },
    background: { default: color.surface, paper: color.surfaceRaised },
    text: { primary: color.ink, secondary: color.inkMuted },
    divider: color.line,
    warning: { main: "#B7791F", dark: color.warning },
    error: { main: color.danger },
    success: { main: tokens.forest[500] },
    info: { main: tokens.forest[600] },
  },
  shape: { borderRadius: radius.md },
  typography: {
    fontFamily: body,
    h1: { fontFamily: display, fontWeight: 600, fontSize: "clamp(2.3rem, 4.6vw, 3.75rem)", lineHeight: 1.06, letterSpacing: "-0.02em" },
    h2: { fontFamily: display, fontWeight: 600, fontSize: "clamp(1.8rem, 3.2vw, 2.5rem)", lineHeight: 1.12, letterSpacing: "-0.015em" },
    h3: { fontFamily: display, fontWeight: 600, fontSize: "1.55rem", lineHeight: 1.2 },
    h4: { fontWeight: 700, fontSize: "1.25rem", lineHeight: 1.3 },
    h5: { fontWeight: 700, fontSize: "1.05rem", lineHeight: 1.35 },
    h6: { fontWeight: 700, fontSize: "0.95rem", lineHeight: 1.4 },
    subtitle1: { fontSize: "1.125rem", lineHeight: 1.6 },
    subtitle2: { fontSize: "0.95rem", fontWeight: 600, lineHeight: 1.45 },
    body1: { fontSize: "1rem", lineHeight: 1.65 },
    body2: { fontSize: "0.9375rem", lineHeight: 1.55 },
    caption: { fontSize: "0.8125rem", lineHeight: 1.45 },
    overline: { fontWeight: 700, letterSpacing: "0.12em", fontSize: "0.75rem", lineHeight: 1.6 },
    button: { textTransform: "none", fontWeight: 600, letterSpacing: 0 },
  },
  transitions: {
    duration: { shortest: motion.fast, shorter: motion.fast, short: motion.base, standard: motion.base, complex: motion.slow, enteringScreen: motion.base, leavingScreen: motion.fast },
    easing: { easeInOut: motion.easing, easeOut: motion.easing, easeIn: "cubic-bezier(0.3, 0, 1, 1)", sharp: motion.easing },
  },
  components: {
    MuiButton: {
      defaultProps: { disableElevation: true },
      styleOverrides: { root: { borderRadius: radius.md, paddingInline: 18, minHeight: 40 }, sizeSmall: { minHeight: 32 }, sizeLarge: { minHeight: 48, paddingInline: 22 } },
    },
    MuiIconButton: { styleOverrides: { root: { borderRadius: radius.md } } },
    MuiToggleButton: { styleOverrides: { root: { textTransform: "none", fontWeight: 600, borderRadius: radius.md } } },
    MuiChip: { styleOverrides: { root: { fontWeight: 600, borderRadius: radius.sm } } },
    MuiPaper: { styleOverrides: { root: { backgroundImage: "none" } } },
    MuiCard: {
      defaultProps: { variant: "outlined" },
      styleOverrides: { root: { borderColor: color.line, borderRadius: radius.lg, boxShadow: elevation.raised } },
    },
    MuiOutlinedInput: { styleOverrides: { root: { backgroundColor: color.surfaceRaised }, notchedOutline: { borderColor: tokens.neutral[500] } } },
    MuiTooltip: { styleOverrides: { tooltip: { fontSize: "0.8125rem", backgroundColor: tokens.forest[950] } } },
    MuiLink: { defaultProps: { underline: "hover" }, styleOverrides: { root: { color: color.leaf } } },
    MuiAlert: { styleOverrides: { root: { borderRadius: radius.md } } },
    MuiCssBaseline: {
      styleOverrides: {
        "::selection": { background: tokens.lime[300], color: tokens.forest[950] },
        ":focus-visible": { outline: `3px solid ${color.focus}`, outlineOffset: 2 },
        body: { WebkitFontSmoothing: "antialiased" },
        "@media (prefers-reduced-motion: reduce)": {
          "*, *::before, *::after": { animationDuration: "0.01ms !important", animationIterationCount: "1 !important", transitionDuration: "0.01ms !important", scrollBehavior: "auto !important" },
        },
      },
    },
  },
});
