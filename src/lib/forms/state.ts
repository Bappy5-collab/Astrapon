/** Result of a server action behind a form. Values are echoed back so a failed submit keeps the farmer's input. */
export type FormState = {
  status: "idle" | "error" | "success";
  message?: string;
  fieldErrors?: Record<string, string>;
  values?: Record<string, string>;
};

export const IDLE: FormState = { status: "idle" };

export function formValues(fd: FormData): Record<string, string> {
  const out: Record<string, string> = {};
  for (const [key, value] of fd.entries()) {
    if (typeof value !== "string" || key.startsWith("$ACTION") || /password/i.test(key)) continue;
    out[key] = key in out ? `${out[key]},${value}` : value;
  }
  return out;
}
