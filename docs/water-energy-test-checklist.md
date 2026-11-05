# Water & Energy — owner test checklist

1. `pnpm dev` (and `pnpm evidence:worker` in a second terminal). Sign in.
2. Open a field with a boundary. On its field page press **Water & Energy**.
3. Wait for the three automatic lookups: mapped water (OpenStreetMap), groundwater providers, and "Sunshine by month (NASA POWER)". A busy map service shows a message, not "no water".
4. Pick a river/canal/pond in the list or on the map. Check the distance wording (centreline vs outline) and that the pipe length is pre-filled as "straight-line minimum".
5. Enter the delivery height above the water (low/high). Press **Fill empty boxes with starting values**.
6. In step 2 choose a comparison that was run with **full irrigation** (or "Enter my own"). Results appear for every option: water to pump, peak day, flow, head, power, energy, PV size.
7. Change **Pumping hours per day** and watch power and energy change.
8. Switch to **Well (groundwater)**. Read the provider list (records available / older / none / not covered / access by request). Try "I don't know" (energy stops, demand stays), then a nearby well as a proxy, then a hypothetical range.
9. Name and **Save this version**. Reload; open it from **Saved versions**; press **Export JSON**.
10. Open the comparison's result page: the "Water & Energy for these options" card shows the saved version.
11. Try the **3D schematic** toggle, and a phone-width window.
12. Try fields in different countries (e.g. France, Australia, Bangladesh, a country without a national adapter) and confirm results change with the field and nothing carries over.

Live provider check: `pnpm water:trace` (writes `data/verification/water-*.json`).
