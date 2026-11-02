"use client";

import { useMemo } from "react";

import type { StrategyView } from "@/domain/simulation/engine";
import { useLocale, useT } from "@/lib/i18n/I18nProvider";
import { MESSAGES, type MessageKey } from "@/lib/i18n/messages";
import { fmt } from "@/lib/i18n/sim-messages";

const MONTHS = {
  en: ["January", "February", "March", "April", "May", "June", "July", "August", "September", "October", "November", "December"],
  bn: ["জানুয়ারি", "ফেব্রুয়ারি", "মার্চ", "এপ্রিল", "মে", "জুন", "জুলাই", "আগস্ট", "সেপ্টেম্বর", "অক্টোবর", "নভেম্বর", "ডিসেম্বর"],
} as const;
const BN_DIGITS = "০১২৩৪৫৬৭৮৯";

/**
 * Locale-aware, unambiguous formatting: dates with the month name ("12 May 2018" / "১২ মে ২০১৮"),
 * numbers with the locale's digits. Written out by hand rather than with Intl so the server and
 * every browser produce identical text (ICU data differs, which broke hydration in Bangla).
 * Missing values render as "—" and are announced by the tables.
 */
export function formatterFor(locale: "en" | "bn") {
  const digits = (s: string) => (locale === "bn" ? s.replace(/[0-9]/g, (d) => BN_DIGITS[Number(d)]!) : s);
  const group = (int: string) => int.replace(/\B(?=(\d{3})+(?!\d))/g, ",");
  const num = (v: number, d: number) => {
    // Up to d decimals, trailing fractional zeros dropped ("5.00" → "5", "0.890" → "0.89").
    const fixed = d > 0 ? Math.abs(v).toFixed(d).replace(/\.?0+$/, "") : Math.abs(v).toFixed(0);
    const [i, frac] = fixed.split(".");
    const out = `${v < 0 && Number(fixed) !== 0 ? "−" : ""}${group(i!)}${frac ? `.${frac}` : ""}`;
    return digits(out);
  };
  const parts = (iso: string) => ({ y: iso.slice(0, 4), m: Number(iso.slice(5, 7)) - 1, d: Number(iso.slice(8, 10)) });
  const month = (m: number, short: boolean) => (short && locale === "en" ? MONTHS.en[m]!.slice(0, 3) : MONTHS[locale][m]!);
  return {
    locale,
    date: (iso: string) => { const p = parts(iso); return digits(`${p.d} ${month(p.m, false)} ${p.y}`); },
    shortDate: (iso: string) => { const p = parts(iso); return digits(`${p.d} ${month(p.m, true)} ${p.y}`); },
    month: (ym: string) => digits(`${month(Number(ym.slice(5, 7)) - 1, false)} ${ym.slice(0, 4)}`),
    /** "MM-DD" without a year (planting windows recur every year). */
    dayMonth: (md: string) => digits(`${Number(md.slice(3, 5))} ${month(Number(md.slice(0, 2)) - 1, false)}`),
    num: (v: number | null | undefined, d = 1) => (v == null ? "—" : num(v, d)),
    int: (v: number) => num(Math.round(v), 0),
    pct: (v: number | null | undefined) => (v == null ? "—" : `${num(Math.round(v * 100), 0)}%`),
  };
}

export function useFmt() {
  const locale = useLocale();
  return useMemo(() => formatterFor(locale), [locale]);
}

/** "Existing practice" / "Alternative 2", localised. */
export function useOptionName() {
  const t = useT();
  return (o: Pick<StrategyView, "id" | "kind">) => (o.kind === "baseline" ? t("sim.option.baseline") : fmt(t("sim.option.alt"), { n: o.id.replace("alternative-", "") }));
}

/** Localised indicator names and units; unknown keys fall back to the engine's English label. */
export function useIndicatorText() {
  const t = useT();
  const has = (k: string): k is MessageKey => k in MESSAGES.en;
  return {
    label: (key: string, fallback: string) => {
      const k = `sim.ind.${key}`;
      return has(k) ? t(k) : fallback;
    },
    unit: (u: string) => {
      const k = `sim.unit.${u}`;
      return has(k) ? t(k) : u;
    },
  };
}
