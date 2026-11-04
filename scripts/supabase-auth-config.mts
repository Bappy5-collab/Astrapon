/**
 * pnpm auth:config [--dry-run]
 *
 * Applies Astrapon's auth settings to the Supabase project through the Management API:
 *  - Site URL (NEXT_PUBLIC_SITE_URL, default https://astrapon.vercel.app), so email links never open localhost;
 *  - redirect URLs: the site with /** and http://localhost:3000/** (existing entries are kept);
 *  - branded subjects and HTML for the "Confirm signup" and "Reset password" emails
 *    (supabase/templates/*.html, token-hash links to /auth/confirm);
 *  - sender name "Astrapon" (only used once custom SMTP is configured; the built-in sender ignores it).
 *
 * Needs SUPABASE_ACCESS_TOKEN (a personal access token from supabase.com → Account → Access tokens)
 * in the environment or .env.local. The project ref comes from NEXT_PUBLIC_SUPABASE_URL.
 * Never prints the token. --dry-run shows what would change and sends nothing.
 */
import { readFileSync } from "node:fs";
import path from "node:path";

import { abbreviateRef, loadEnv, ROOT } from "./db/connect.mts";

loadEnv();
const DRY = process.argv.includes("--dry-run");
const token = process.env.SUPABASE_ACCESS_TOKEN?.trim();
const url = process.env.NEXT_PUBLIC_SUPABASE_URL ?? "";
const ref = /^https:\/\/([a-z0-9]{20})\.supabase\.co/.exec(url)?.[1];
if (!ref) {
  console.error("SETUP REQUIRED: NEXT_PUBLIC_SUPABASE_URL must be https://<ref>.supabase.co");
  process.exit(2);
}
if (!token) {
  console.error("SETUP REQUIRED: set SUPABASE_ACCESS_TOKEN (supabase.com → Account → Access tokens) in .env.local or the environment.");
  process.exit(2);
}

const site = (process.env.NEXT_PUBLIC_SITE_URL?.trim() || "https://astrapon.vercel.app").replace(/\/+$/, "");
if (!/^https:\/\/[^/]+$/.test(site)) {
  console.error(`Refusing: the Site URL must be an https origin without a path (got ${site}).`);
  process.exit(2);
}
const template = (name: string) => readFileSync(path.join(ROOT, "supabase", "templates", name), "utf8");

const API = `https://api.supabase.com/v1/projects/${ref}/config/auth`;
const auth = { Authorization: `Bearer ${token}` };

const res = await fetch(API, { headers: auth });
if (!res.ok) {
  console.error(`Could not read the auth config (HTTP ${res.status}). Check that the token belongs to an account with access to project ${abbreviateRef(ref)}.`);
  process.exit(1);
}
const current = (await res.json()) as Record<string, unknown>;

const allow = new Set(
  String(current.uri_allow_list ?? "")
    .split(",")
    .map((s) => s.trim())
    .filter(Boolean),
);
allow.add(`${site}/**`);
allow.add("http://localhost:3000/**");

const next: Record<string, string> = {
  site_url: site,
  uri_allow_list: [...allow].join(","),
  mailer_subjects_confirmation: "Confirm your Astrapon account",
  mailer_templates_confirmation_content: template("confirm-signup.html"),
  mailer_subjects_recovery: "Reset your Astrapon password",
  mailer_templates_recovery_content: template("reset-password.html"),
  smtp_sender_name: "Astrapon",
};

// Only send keys the API reports, so a renamed field fails loudly instead of being ignored.
const unknown = Object.keys(next).filter((k) => !(k in current));
if (unknown.length) {
  console.error(`The Management API did not report these settings: ${unknown.join(", ")}. Nothing was changed.`);
  process.exit(1);
}

const changes = Object.entries(next).filter(([k, v]) => current[k] !== v);
console.log(`Project ${abbreviateRef(ref)} · Site URL → ${site}`);
for (const [k, v] of changes) console.log(`  ${k}: ${k.endsWith("_content") ? `${v.length} characters of HTML` : v}`);
if (!changes.length) {
  console.log("Already up to date.");
  process.exit(0);
}
if (DRY) {
  console.log("Dry run: nothing sent.");
  process.exit(0);
}

const patch = await fetch(API, { method: "PATCH", headers: { ...auth, "Content-Type": "application/json" }, body: JSON.stringify(Object.fromEntries(changes)) });
if (!patch.ok) {
  console.error(`Update failed (HTTP ${patch.status}). Nothing else was changed.`);
  process.exit(1);
}
console.log(`Updated ${changes.length} setting(s).`);
if (current.smtp_host == null || current.smtp_host === "") console.log("Note: the built-in email sender is still in use, so mails come from Supabase's address. Configure custom SMTP to send as Astrapon.");
