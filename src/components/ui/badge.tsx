const TONES = {
  success: "border-success-border bg-success-soft text-success",
  warn: "border-warn-border bg-warn-soft text-warn",
  danger: "border-danger-border bg-danger-soft text-danger",
  primary: "border-primary-soft-border bg-primary-soft text-primary",
  neutral: "border-border bg-surface-2 text-t2",
} as const;

export function Badge({
  tone = "neutral",
  className = "",
  children,
}: {
  tone?: keyof typeof TONES;
  className?: string;
  children: React.ReactNode;
}) {
  return (
    <span
      className={`inline-flex h-[22px] items-center gap-1 rounded-full border px-2.5 text-xs font-semibold ${TONES[tone]} ${className}`}
    >
      {children}
    </span>
  );
}
