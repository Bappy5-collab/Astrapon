"use server";

import { headers } from "next/headers";
import { redirect } from "next/navigation";
import { isAuthRetryableFetchError } from "@supabase/supabase-js";
import { z } from "zod";

import { formValues, type FormState } from "@/lib/forms/state";
import { getSupabaseServerClient } from "@/server/database/supabase-server";

import { safeNextPath } from "./session";

const UNREACHABLE: FormState = { status: "error", message: "The account service did not respond. Check your connection and try again." };
const UNCONFIGURED: FormState = { status: "error", message: "Accounts are not configured on this server. See Setup." };
const email = z.email({ error: "Enter a valid email address" }).max(254);
// Matches Supabase's default minimum; the project setting may require more and will say so.
const password = z.string().min(8, "Use at least 8 characters").max(72, "At most 72 characters");

async function origin(): Promise<string> {
  const h = await headers();
  const o = h.get("origin");
  if (o) return o;
  const host = h.get("x-forwarded-host") ?? h.get("host");
  const proto = h.get("x-forwarded-proto") ?? "http";
  return `${proto}://${host}`;
}

function invalid(error: z.ZodError, fd: FormData): FormState {
  const fieldErrors: Record<string, string> = {};
  for (const i of error.issues) fieldErrors[String(i.path[0])] ??= i.message;
  return { status: "error", message: "Check the highlighted fields.", fieldErrors, values: formValues(fd) };
}

export async function signIn(_: FormState, fd: FormData): Promise<FormState> {
  const supabase = await getSupabaseServerClient();
  if (!supabase) return UNCONFIGURED;
  const parsed = z.object({ email, password: z.string().min(1, "Required") }).safeParse(Object.fromEntries(fd));
  if (!parsed.success) return invalid(parsed.error, fd);
  const { error } = await supabase.auth.signInWithPassword(parsed.data);
  if (error && isAuthRetryableFetchError(error)) return { ...UNREACHABLE, values: formValues(fd) };
  if (error) {
    const unconfirmed = error.code === "email_not_confirmed";
    return {
      status: "error",
      message: unconfirmed ? "Confirm your email address first. Check your inbox for the link." : "Email or password is incorrect.",
      values: formValues(fd),
    };
  }
  redirect(safeNextPath(fd.get("next")?.toString()));
}

export async function signUp(_: FormState, fd: FormData): Promise<FormState> {
  const supabase = await getSupabaseServerClient();
  if (!supabase) return UNCONFIGURED;
  const parsed = z
    .object({ email, password, confirm: z.string() })
    .refine((v) => v.password === v.confirm, { path: ["confirm"], message: "Passwords do not match" })
    .safeParse(Object.fromEntries(fd));
  if (!parsed.success) return invalid(parsed.error, fd);
  const { data, error } = await supabase.auth.signUp({
    email: parsed.data.email,
    password: parsed.data.password,
    options: { emailRedirectTo: `${await origin()}/auth/confirm?next=/farms` },
  });
  if (error && isAuthRetryableFetchError(error)) return { ...UNREACHABLE, values: formValues(fd) };
  if (error) {
    const weak = error.code === "weak_password";
    const limited = error.code === "over_email_send_rate_limit";
    return {
      status: "error",
      message: weak ? error.message : limited ? "Too many emails were sent recently. Try again later." : "Sign-up failed. Try again.",
      values: formValues(fd),
    };
  }
  if (data.session) redirect("/farms");
  // Same message whether or not the address already had an account (no account enumeration).
  return { status: "success", message: "Check your email for a confirmation link to finish creating your account." };
}

export async function signOut(): Promise<void> {
  const supabase = await getSupabaseServerClient();
  if (supabase) await supabase.auth.signOut();
  redirect("/sign-in?signed_out=1");
}

export async function requestPasswordReset(_: FormState, fd: FormData): Promise<FormState> {
  const supabase = await getSupabaseServerClient();
  if (!supabase) return UNCONFIGURED;
  const parsed = z.object({ email }).safeParse(Object.fromEntries(fd));
  if (!parsed.success) return invalid(parsed.error, fd);
  const { error } = await supabase.auth.resetPasswordForEmail(parsed.data.email, {
    redirectTo: `${await origin()}/auth/confirm?next=/account/update-password`,
  });
  if (error && isAuthRetryableFetchError(error)) return UNREACHABLE;
  if (error?.code === "over_email_send_rate_limit") return { status: "error", message: "Too many emails were sent recently. Try again later." };
  return { status: "success", message: "If an account exists for that address, a reset link is on its way." };
}

export async function updatePassword(_: FormState, fd: FormData): Promise<FormState> {
  const supabase = await getSupabaseServerClient();
  if (!supabase) return UNCONFIGURED;
  const { data } = await supabase.auth.getClaims();
  if (!data?.claims?.sub) return { status: "error", message: "Your reset link has expired. Request a new one." };
  const parsed = z
    .object({ password, confirm: z.string() })
    .refine((v) => v.password === v.confirm, { path: ["confirm"], message: "Passwords do not match" })
    .safeParse(Object.fromEntries(fd));
  if (!parsed.success) return invalid(parsed.error, fd);
  const { error } = await supabase.auth.updateUser({ password: parsed.data.password });
  if (error) return { status: "error", message: error.code === "same_password" ? "Choose a password you have not used here before." : error.message };
  return { status: "success", message: "Password updated." };
}
