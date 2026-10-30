"use client";

import Alert from "@mui/material/Alert";
import Button from "@mui/material/Button";
import Checkbox from "@mui/material/Checkbox";
import FormControlLabel from "@mui/material/FormControlLabel";
import Stack from "@mui/material/Stack";
import TextField, { type TextFieldProps } from "@mui/material/TextField";
import { createContext, useActionState, useContext, useId } from "react";

import { IDLE, type FormState } from "@/lib/forms/state";

type Action = (state: FormState, formData: FormData) => Promise<FormState>;

const FormStateContext = createContext<{ state: FormState; pending: boolean }>({ state: IDLE, pending: false });

/**
 * Progressive-enhancement form bound to a server action. Field components read errors and the
 * echoed values from context, so a failed submit keeps what the farmer typed.
 */
export function ActionForm({
  action,
  submitLabel,
  children,
  successMessage,
  direction = "column",
  submitColor = "primary",
}: {
  action: Action;
  submitLabel: string;
  children: React.ReactNode;
  successMessage?: string;
  direction?: "column" | "row";
  submitColor?: "primary" | "secondary" | "error";
}) {
  const [state, formAction, pending] = useActionState(action, IDLE);
  const statusId = useId();
  return (
    <FormStateContext.Provider value={{ state, pending }}>
      <Stack component="form" action={formAction} noValidate spacing={2} aria-describedby={statusId}>
        <Stack direction={direction === "row" ? { xs: "column", md: "row" } : "column"} spacing={2} useFlexGap sx={{ flexWrap: "wrap" }}>
          {children}
        </Stack>
        <div id={statusId} aria-live="polite">
          {state.status === "error" && state.message && <Alert severity="error">{state.message}</Alert>}
          {state.status === "success" && (state.message ?? successMessage) && <Alert severity="success">{state.message ?? successMessage}</Alert>}
        </div>
        <div>
          <Button type="submit" variant="contained" color={submitColor} disabled={pending}>
            {pending ? "Saving…" : submitLabel}
          </Button>
        </div>
      </Stack>
    </FormStateContext.Provider>
  );
}

type FieldProps = Omit<TextFieldProps, "name" | "error" | "defaultValue"> & { name: string; defaultValue?: string | number | null };

/** Text/number/date input wired to the surrounding ActionForm. */
export function FormField({ name, defaultValue, helperText, ...rest }: FieldProps) {
  const { state } = useContext(FormStateContext);
  const error = state.fieldErrors?.[name];
  const value = state.status === "error" && state.values && name in state.values ? state.values[name] : (defaultValue ?? "");
  return (
    <TextField
      name={name}
      // Remount on each result so the echoed value is applied after React resets the form.
      key={`${name}:${state.status}:${String(value)}`}
      defaultValue={value}
      error={Boolean(error)}
      helperText={error ?? helperText}
      size="small"
      {...rest}
    />
  );
}

/** Native select (works without JavaScript and with form reset). */
export function FormSelect({
  name,
  label,
  options,
  defaultValue,
  helperText,
  required,
  sx,
}: {
  name: string;
  label: string;
  options: readonly { value: string; label: string }[];
  defaultValue?: string | null;
  helperText?: string;
  required?: boolean;
  sx?: TextFieldProps["sx"];
}) {
  const { state } = useContext(FormStateContext);
  const error = state.fieldErrors?.[name];
  const value = state.status === "error" && state.values && name in state.values ? state.values[name] : (defaultValue ?? "");
  return (
    <TextField
      select
      name={name}
      label={label}
      key={`${name}:${state.status}:${value}`}
      defaultValue={value}
      required={required}
      error={Boolean(error)}
      helperText={error ?? helperText}
      size="small"
      sx={{ minWidth: 200, ...sx }}
      slotProps={{ select: { native: true }, inputLabel: { shrink: true } }}
    >
      {options.map((o) => (
        <option key={o.value} value={o.value}>
          {o.label}
        </option>
      ))}
    </TextField>
  );
}

export function FormCheckbox({ name, label, defaultChecked, value = "on" }: { name: string; label: string; defaultChecked?: boolean; value?: string }) {
  const { state } = useContext(FormStateContext);
  const echoed = state.status === "error" && state.values ? (state.values[name] ?? "").split(",").includes(value) : undefined;
  const checked = echoed ?? Boolean(defaultChecked);
  return (
    <FormControlLabel
      key={`${name}:${value}:${state.status}:${checked}`}
      control={<Checkbox name={name} value={value} defaultChecked={checked} size="small" />}
      label={label}
    />
  );
}
