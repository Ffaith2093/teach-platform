"use client";

import * as React from "react";

export function FormField({
  label,
  required,
  hint,
  error,
  children,
}: {
  label: string;
  required?: boolean;
  hint?: string;
  error?: string;
  children: React.ReactNode;
}) {
  return (
    <div>
      <label className="mb-1 block text-xs font-medium text-muted-foreground">
        {label}
        {required && <span className="ml-0.5 text-danger">*</span>}
      </label>
      {children}
      {hint && !error && <p className="mt-1 text-[11px] text-subtle-foreground">{hint}</p>}
      {error && <p className="mt-1 text-[11px] text-danger">{error}</p>}
    </div>
  );
}