"use client";

import FormControl from "@mui/material/FormControl";
import FormControlLabel from "@mui/material/FormControlLabel";
import FormLabel from "@mui/material/FormLabel";
import Radio from "@mui/material/Radio";
import RadioGroup from "@mui/material/RadioGroup";
import Stack from "@mui/material/Stack";
import Typography from "@mui/material/Typography";
import { useRouter } from "next/navigation";

import { useLocale, useT } from "@/lib/i18n/I18nProvider";
import { LOCALE_COOKIE, LOCALE_NAMES, LOCALES, type Locale } from "@/lib/i18n/messages";
import { useMotionPreference, useQualityPreference, type MotionPreference, type QualityPreference } from "@/lib/preferences";

export function SettingsForm() {
  const t = useT();
  const locale = useLocale();
  const router = useRouter();
  const [quality, setQuality] = useQualityPreference();
  const [motion, setMotion] = useMotionPreference();

  const setLocale = (l: Locale) => {
    document.cookie = `${LOCALE_COOKIE}=${l}; path=/; max-age=31536000; samesite=lax`;
    router.refresh();
  };

  return (
    <Stack spacing={4}>
      <FormControl>
        <FormLabel id="lang-label" sx={{ fontWeight: 700, color: "text.primary" }}>
          {t("set.language")}
        </FormLabel>
        <RadioGroup aria-labelledby="lang-label" value={locale} onChange={(e) => setLocale(e.target.value as Locale)}>
          {LOCALES.map((l) => (
            <FormControlLabel key={l} value={l} control={<Radio />} label={<span lang={l}>{LOCALE_NAMES[l]}</span>} sx={{ minHeight: 44 }} />
          ))}
        </RadioGroup>
        <Typography variant="caption" color="text.secondary">
          Bangla covers navigation, the field workspace, location search and the landing page. Record forms, evidence and methodology text are still English. Crop names stay as you
          typed them.
        </Typography>
      </FormControl>

      <FormControl>
        <FormLabel id="quality-label" sx={{ fontWeight: 700, color: "text.primary" }}>
          {t("set.quality")}
        </FormLabel>
        <RadioGroup aria-labelledby="quality-label" value={quality} onChange={(e) => setQuality(e.target.value as QualityPreference)}>
          <FormControlLabel value="auto" control={<Radio />} label={t("set.qualityAuto")} sx={{ minHeight: 44 }} />
          <FormControlLabel value="low" control={<Radio />} label={t("set.qualityLow")} sx={{ minHeight: 44 }} />
          <FormControlLabel value="balanced" control={<Radio />} label={t("set.qualityBalanced")} sx={{ minHeight: 44 }} />
          <FormControlLabel value="high" control={<Radio />} label={t("set.qualityHigh")} sx={{ minHeight: 44 }} />
        </RadioGroup>
        <Typography variant="caption" color="text.secondary">
          Automatic picks Low on software graphics and Balanced otherwise. Stored on this device only.
        </Typography>
      </FormControl>

      <FormControl>
        <FormLabel id="motion-label" sx={{ fontWeight: 700, color: "text.primary" }}>
          {t("set.motion")}
        </FormLabel>
        <RadioGroup aria-labelledby="motion-label" value={motion} onChange={(e) => setMotion(e.target.value as MotionPreference)}>
          <FormControlLabel value="system" control={<Radio />} label={t("set.motionSystem")} sx={{ minHeight: 44 }} />
          <FormControlLabel value="reduce" control={<Radio />} label={t("set.motionReduce")} sx={{ minHeight: 44 }} />
        </RadioGroup>
        <Typography variant="caption" color="text.secondary">
          Reduced motion stops the landing page&apos;s turning 3D sample. The workspace never moves the camera on its own.
        </Typography>
      </FormControl>
    </Stack>
  );
}
