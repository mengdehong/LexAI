import * as React from "react";

export type SelectProps = React.SelectHTMLAttributes<HTMLSelectElement> & {
  fullWidth?: boolean;
};

export function Select({ className, fullWidth = true, children, ...props }: SelectProps) {
  const base = "form-select" + (fullWidth ? " w-full" : "");
  return (
    <select className={className ? `${base} ${className}` : base} {...props}>
      {children}
    </select>
  );
}
