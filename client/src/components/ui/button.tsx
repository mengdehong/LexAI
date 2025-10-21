import * as React from "react";

export type ButtonProps = React.ButtonHTMLAttributes<HTMLButtonElement> & {
  variant?: "default" | "active";
};

export function Button({ variant = "default", className, ...props }: ButtonProps) {
  const base = "topbar__button";
  const cls = variant === "active" ? `${base} active` : base;
  return <button className={className ? `${cls} ${className}` : cls} {...props} />;
}
