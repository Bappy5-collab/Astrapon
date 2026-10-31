import { cookies } from "next/headers";

import { isLocale, LOCALE_COOKIE, translate, type Locale, type MessageKey } from "./messages";

export async function getLocale(): Promise<Locale> {
  const value = (await cookies()).get(LOCALE_COOKIE)?.value;
  return isLocale(value) ? value : "en";
}

export async function getT() {
  const locale = await getLocale();
  return (key: MessageKey) => translate(locale, key);
}
