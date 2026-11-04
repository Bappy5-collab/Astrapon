import Container from "@mui/material/Container";
import Typography from "@mui/material/Typography";
import type { Metadata } from "next";
import { notFound } from "next/navigation";

import { EvidenceDashboard } from "@/components/evidence/EvidenceDashboard";
import { PageHeader } from "@/components/farm/ui";
import { ButtonLink } from "@/components/links";
import { SetupRequired } from "@/components/SetupRequired";
import type { PipelineSource } from "@/domain/evidence/catalog";
import { requireUser } from "@/server/auth/session";
import { cancelEvidenceJob, requestEvidence } from "@/server/evidence/actions";
import { getFieldEvidence } from "@/server/evidence/queries";
import { getField } from "@/server/farm/queries";

export const metadata: Metadata = { title: "Field evidence" };

export default async function FieldEvidencePage({ params }: PageProps<"/fields/[fieldId]/evidence">) {
  const { fieldId } = await params;
  const user = await requireUser(`/fields/${fieldId}/evidence`);
  if (user.state !== "signed_in") return <SetupRequired feature="Field evidence" reason={user.state} />;
  if (!/^[0-9a-f-]{36}$/i.test(fieldId)) notFound();
  const field = await getField(user.supabase, fieldId);
  if (!field) notFound();
  if (!field.geometry.boundary)
    return (
      <Container maxWidth="md" sx={{ py: 6 }}>
        <PageHeader crumbs={[{ href: "/workspace", label: "My fields" }, { href: `/fields/${fieldId}/records`, label: field.name }]} title="Weather and soil" />
        <Typography>Draw the field on the map first: weather and soil data are found from the field&apos;s location.</Typography>
        <ButtonLink href={`/fields/${fieldId}`} variant="contained" sx={{ mt: 2 }}>
          Draw the field
        </ButtonLink>
      </Container>
    );
  const evidence = await getFieldEvidence(user.supabase, fieldId);
  const request = async (sources: PipelineSource[]) => {
    "use server";
    return requestEvidence(fieldId, sources);
  };
  const cancel = async (jobId: string) => {
    "use server";
    return cancelEvidenceJob(fieldId, jobId);
  };
  return (
    <Container maxWidth="lg" sx={{ py: { xs: 4, md: 6 } }}>
      <PageHeader
        crumbs={[{ href: "/workspace", label: "My fields" }, { href: `/fields/${fieldId}/records`, label: field.name }]}
        title="Weather and soil"
        eyebrow={field.name}
        subtitle="Public NASA weather and (in the US) USDA soil survey data for this field's location. Press “Refresh all” once; the download runs in the background and you can leave this page."
        actions={
          <ButtonLink href={`/fields/${fieldId}/records`} variant="outlined">
            Back to the field steps
          </ButtonLink>
        }
      />
      <EvidenceDashboard
        evidence={evidence}
        actions={{ request, cancel }}
        boundary={field.geometry.boundary}
        zones={field.geometry.zones}
        // eslint-disable-next-line react-hooks/purity
        renderedAt={Date.now()}
      />
    </Container>
  );
}
