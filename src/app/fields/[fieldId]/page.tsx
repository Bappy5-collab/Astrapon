import type { Metadata } from "next";
import { notFound } from "next/navigation";

import { SetupRequired } from "@/components/SetupRequired";
import { SavedWorkspace } from "@/components/workspace/SavedWorkspace";
import { boundaryOrigin, projectField } from "@/domain/geo/local-frame";
import { fieldCoverage } from "@/domain/sources/coverage";
import { requireUser } from "@/server/auth/session";
import type { PipelineSource } from "@/domain/evidence/catalog";
import { cancelEvidenceJob, requestEvidence } from "@/server/evidence/actions";
import { getFieldEvidence } from "@/server/evidence/queries";
import { saveWorkspace } from "@/server/farm/actions";
import { getField } from "@/server/farm/queries";
import { toWorkspaceField } from "@/server/farm/workspace";

export const metadata: Metadata = { title: "Field workspace" };

export default async function FieldWorkspacePage({ params }: PageProps<"/fields/[fieldId]">) {
  const { fieldId } = await params;
  const user = await requireUser(`/fields/${fieldId}`);
  if (user.state !== "signed_in") return <SetupRequired feature="The field workspace" reason={user.state} />;
  if (!/^[0-9a-f-]{36}$/i.test(fieldId)) notFound();
  const field = await getField(user.supabase, fieldId);
  if (!field) notFound();
  const data = toWorkspaceField(field);
  const coverage = data.boundary ? fieldCoverage(boundaryOrigin(data.boundary)[1], projectField(data.boundary).extentM, data.countryCode) : [];
  // Remount the client workspace whenever saved data changes so it starts from the stored state.
  const revision = [field.area_ha, data.zones.map((z) => `${z.id}:${z.name}:${z.areaHa}`).join(","), data.history.map((h) => `${h.id}:${h.crop_name}`).join(",")].join("|");
  // Evidence is optional: if it cannot be loaded, the workspace still opens and says so.
  let evidence = null;
  try {
    if (data.boundary) evidence = await getFieldEvidence(user.supabase, field.id);
  } catch {
    evidence = null;
  }
  const request = async (sources: PipelineSource[]) => {
    "use server";
    return requestEvidence(fieldId, sources);
  };
  const cancel = async (jobId: string) => {
    "use server";
    return cancelEvidenceJob(fieldId, jobId);
  };
  return (
    <SavedWorkspace key={revision} field={data} coverage={coverage} currentYear={new Date().getUTCFullYear()} save={saveWorkspace.bind(null, field.id)}
      // eslint-disable-next-line react-hooks/purity
      evidence={evidence ? { data: evidence, actions: { request, cancel }, renderedAt: Date.now() } : null}
    />
  );
}
