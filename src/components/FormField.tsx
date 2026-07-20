import type { ReactNode } from "react";

type FormFieldProps = {
  icon: ReactNode;
  label: string;
  value: string;
  onChange: (value: string) => void;
  type?: string;
  autoComplete?: string;
};

export function FormField({ icon, label, value, onChange, type = "text", autoComplete }: FormFieldProps) {
  return (
    <label className="form-field">
      {label}
      <span>
        {icon}
        <input
          autoComplete={autoComplete}
          type={type}
          value={value}
          onChange={(event) => onChange(event.target.value)}
        />
      </span>
    </label>
  );
}
