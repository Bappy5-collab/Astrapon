"use client";

import { useRouter } from "next/navigation";

import { LocationSearch } from "./LocationSearch";

export const PENDING_LOCATION_KEY = "fs.newfield.at";

/**
 * Landing search: the picked place is handed to the new-field flow through sessionStorage (never
 * the URL, so a device location does not end up in history or server logs), then that page opens
 * centred there (after sign-in if needed).
 */
export function HeroSearch() {
  const router = useRouter();
  return (
    <LocationSearch
      onPick={(p) => {
        try {
          window.sessionStorage.setItem(PENDING_LOCATION_KEY, JSON.stringify({ lat: p.lat, lon: p.lon, label: p.label }));
        } catch {
          // Storage blocked: the new-field page simply starts without a location.
        }
        router.push("/fields/new");
      }}
    />
  );
}
