import * as React from "react";

export type InputProps = React.InputHTMLAttributes<HTMLInputElement> & {
  fullWidth?: boolean;
};

export function Input({ className, fullWidth = true, ...props }: InputProps) {
  const base = "form-input" + (fullWidth ? " w-full" : "");
  return <input className={className ? `${base} ${className}` : base} {...props} />;
}
