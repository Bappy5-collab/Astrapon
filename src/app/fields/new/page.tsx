import type { Metadata } from "next";

import { SetupRequired } from "@/components/SetupRequired";
import { NewFieldFlow } from "@/components/workspace/NewFieldFlow";
import { requireUser } from "@/server/auth/session";
import { createFieldFromDrawing } from "@/server/farm/actions";
import { listFarms, SchemaMissingError } from "@/server/farm/queries";

export const metadata: Metadata = { title: "Create a field" };

export default async function NewFieldPage() {
  const user = await requireUser("/fields/new");
  if (user.state !== "signed_in") return <SetupRequired feature="Creating fields" reason={user.state} />;
  let farms: { id: string; name: string }[] = [];
  try {
    farms = (await listFarms(user.supabase)).map((f) => ({ id: f.id, name: f.name }));
  } catch (e) {
    if (e instanceof SchemaMissingError) return <SetupRequired feature="Creating fields" reason="unconfigured" />;
    throw e;
  }
  return <NewFieldFlow farms={farms} create={createFieldFromDrawing} />;
}
