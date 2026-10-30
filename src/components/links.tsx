"use client";

import Button, { type ButtonProps } from "@mui/material/Button";
import Link, { type LinkProps } from "@mui/material/Link";
import NextLink from "next/link";

/**
 * MUI components rendered as Next.js links. Server Components cannot pass the
 * NextLink component across the client boundary, so they use these instead.
 */
export function ButtonLink(props: Omit<ButtonProps<typeof NextLink>, "component">) {
  return <Button component={NextLink} {...props} />;
}

export function TextLink(props: Omit<LinkProps<typeof NextLink>, "component">) {
  return <Link component={NextLink} {...props} />;
}
