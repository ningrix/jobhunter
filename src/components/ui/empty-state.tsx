import type { LucideIcon } from "lucide-react";

export function EmptyState({
  icon: Icon,
  title,
  hint,
  action,
  className = "",
}: {
  icon: LucideIcon;
  title: string;
  hint?: string;
  action?: React.ReactNode;
  className?: string;
}) {
  return (
    <div className={`flex flex-col items-center justify-center gap-1.5 py-12 text-center ${className}`}>
      <div className="mb-1.5 flex h-11 w-11 items-center justify-center rounded-xl bg-primary-soft text-primary">
        <Icon size={20} strokeWidth={1.7} />
      </div>
      <p className="text-sm font-semibold text-t2">{title}</p>
      {hint && <p className="text-xs text-t3">{hint}</p>}
      {action && <div className="mt-3">{action}</div>}
    </div>
  );
}
