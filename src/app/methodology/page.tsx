import Box from "@mui/material/Box";
import Container from "@mui/material/Container";
import Typography from "@mui/material/Typography";
import type { Metadata } from "next";

import { PageHeader, Section } from "@/components/farm/ui";
import { TextLink } from "@/components/links";
import { MAX_ABS_LATITUDE, MAX_FIELD_HA, MIN_FIELD_HA } from "@/domain/geo/boundary";
import { MAX_SUPPORTED_EXTENT_M } from "@/domain/geo/local-frame";
import { EVIDENCE_CLASSES, EVIDENCE_CLASS_INFO } from "@/domain/provenance/evidence";
import { color, radius } from "@/theme/tokens";

export const metadata: Metadata = { title: "Methodology", description: "How Astrapon handles evidence, field geometry, the 3D view, maps and search." };

function P({ children }: { children: React.ReactNode }) {
  return (
    <Typography variant="body1" sx={{ mb: 1.5, maxWidth: 760 }}>
      {children}
    </Typography>
  );
}

export default function MethodologyPage() {
  return (
    <Container maxWidth="md" sx={{ py: { xs: 4, md: 6 } }}>
      <PageHeader crumbs={[]} title="Methodology">
        <Typography color="text.secondary" sx={{ maxWidth: 720 }}>
          What Astrapon does today, how, and what it refuses to pretend. This page changes as each part is built.
        </Typography>
      </PageHeader>

      <Section id="evidence" title="Evidence classes">
        <P>Every value carries one of these classes, and they are never mixed without saying so.</P>
        <Box component="dl" sx={{ m: 0, display: "grid", gap: 1.25 }}>
          {EVIDENCE_CLASSES.map((c) => (
            <Box key={c} sx={{ p: 1.5, borderRadius: `${radius.md}px`, bgcolor: color.surfaceSunken }}>
              <Typography component="dt" variant="subtitle2">
                {EVIDENCE_CLASS_INFO[c].label}
              </Typography>
              <Typography component="dd" variant="body2" color="text.secondary" sx={{ m: 0 }}>
                {EVIDENCE_CLASS_INFO[c].meaning}
              </Typography>
            </Box>
          ))}
        </Box>
      </Section>

      <Section id="geometry" title="Field geometry">
        <P>
          Boundaries are stored as WGS84 longitude/latitude polygons (PostGIS MultiPolygon, EPSG:4326). Area is computed on the ellipsoid by the database, and checked in the
          browser with a spherical formula before saving. A field must be between {MIN_FIELD_HA} and {MAX_FIELD_HA.toLocaleString("en")} ha, span at most {MAX_SUPPORTED_EXTENT_M / 1000} km, lie within ±
          {MAX_ABS_LATITUDE}° latitude, and have no crossing edges. Cut-out areas (holes) must sit inside the outer edge without touching each other.
        </P>
        <P>
          For the 3D view, degrees are never treated as metres. Each field gets its own local frame: positions are converted to Earth-centred coordinates and rotated into
          east/north metres at the field&apos;s centre. Across {MAX_SUPPORTED_EXTENT_M / 1000} km the flat-plane error is a few centimetres. One uniform scale then fits the
          field to the view, so shapes and proportions are preserved.
        </P>
        <P>
          Fields that cross the 180° meridian are not supported yet and are rejected with an explanation; draw the parts on each side as separate fields. Fields next to the
          meridian work, because longitudes are unwrapped around the field centre.
        </P>
        <P>
          Planting zones must lie inside the field (1 m tolerance for digitising). If a new boundary would leave a zone outside, the save is refused unless that zone is also
          adjusted or deleted in the same save. Zones come only from the farmer&apos;s knowledge or records, never from coarse satellite grids.
        </P>
      </Section>

      <Section id="three-d" title="What the 3D view shows">
        <P>
          The terrain is flat. Astrapon does not invent slopes, buildings or trees. Elevation will only appear once a terrain source is retrieved and labelled.
        </P>
        <P>
          Crops are original, stylised models chosen from the crop name you recorded (tall row crop, small grain, paddy, broadleaf, flowering oilseed, fibre, cover, fallow, or a
          generic form for unknown names). They are drawn larger than life and at an illustrative density so they can be read at field scale; they are not a plant count. The
          growth-stage control only changes the drawing. It is not observed and not predicted.
        </P>
        <P>
          Everything in the 3D view is also available as text: the zone list, the year-by-zone timeline table, and the Inspect panel. Without WebGL, the map and those tables
          still work.
        </P>
      </Section>

      <Section id="maps" title="Maps, imagery and place search">
        <P>
          Street map tiles are © <TextLink href="https://www.openstreetmap.org/copyright">OpenStreetMap contributors</TextLink>, used under the OSM tile usage policy (attribution
          shown on the map, no bulk or offline use). Satellite imagery is NASA&apos;s Harmonized Landsat Sentinel-2 (HLS) 30 m reflectance from{" "}
          <TextLink href="https://www.earthdata.nasa.gov/eosdis/science-system-description/eosdis-components/gibs">NASA GIBS</TextLink>. HLS tiles exist only where a satellite passed
          on the chosen date and may contain cloud; imagery is a drawing aid, not evidence used in any calculation.
        </P>
        <P>
          Place search uses the public OpenStreetMap <TextLink href="https://operations.osmfoundation.org/policies/nominatim/">Nominatim</TextLink> service under its usage policy:
          searches run only when you press Search (no autocomplete), all users share a 1-request-per-second limit through our server, results are cached, and only the text you
          type is sent. Your device location is requested only when you press &quot;Use my location&quot;, is used in your browser to centre the map, and is not stored unless you
          save a field there.
        </P>
      </Section>

      <Section id="evidence-pipeline" title="Environmental evidence">
        <P>
          For a saved field, Astrapon fetches NASA POWER daily weather (model-derived, one ½° × ⅝° grid cell, 1981 onwards), MODIS MOD13Q1 greenness (satellite, ≈232 m pixels,
          2000 onwards, good-quality composites only) and, in the United States, SSURGO soil water capacity. Downloads run in a separate background worker, never inside a web
          request; each source can be refreshed, retried or cancelled, and a failed refresh keeps the earlier data, marked stale.
        </P>
        <P>
          Missing days are never treated as zero or filled in. Monthly values need 90% of days, yearly counts 95%; normals use 1991–2020. Coarse sources are shown as one shared
          value for the field; differences inside a field are shown only when at least two MODIS pixels lie mostly inside it. Indicators describe past conditions; they are not
          crop damage, yield or forecasts, and NDVI cannot identify a crop. Saved snapshots pin the exact retrieval they used, so a later refresh never changes them.
        </P>
        <P>
          Full rules are in <code>docs/evidence-methods.md</code> in the project repository.
        </P>
      </Section>

      <Section id="not-yet" title="Not built yet">
        <P>
          The rotation simulation engine, historical replay of rotations and rotation comparison are later phases. Until then Astrapon shows no yields, water balances, risks or
          rankings, and the run state says so.
        </P>
      </Section>
    </Container>
  );
}
