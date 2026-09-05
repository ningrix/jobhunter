import type { ButtonHTMLAttributes } from "react";

const VARIANTS = {
  primary: "bg-gradient-brand text-on-primary hover:opacity-90",
  soft: "border border-primary-soft-border bg-primary-soft text-primary hover:bg-primary-soft/70",
  ghost: "border border-border-strong bg-surface text-t2 hover:border-t3 hover:text-t1",
  danger: "border border-danger-border bg-danger-soft text-danger hover:bg-danger-soft/70",
  success: "border border-success-border bg-success-soft text-success hover:bg-success-soft/70",
} as const;

const SIZES = {
  sm: "h-8 px-3 text-xs",
  md: "h-[38px] px-[18px] text-sm",
  lg: "h-11 px-6 text-sm",
} as const;

export function Button({
  variant = "primary",
  size = "md",
  type = "button",
  className = "",
  ...props
}: ButtonHTMLAttributes<HTMLButtonElement> & {
  variant?: keyof typeof VARIANTS;
  size?: keyof typeof SIZES;
}) {
  return (
    <button
      type={type}
      className={`inline-flex items-center justify-center gap-2 rounded-[10px] font-semibold transition focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-primary disabled:pointer-events-none disabled:opacity-50 ${VARIANTS[variant]} ${SIZES[size]} ${className}`}
      {...props}
    />
  );
}
