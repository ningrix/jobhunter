export const inputBase =
  "w-full rounded-[10px] border border-border-strong bg-surface text-sm text-t1 outline-none transition-colors placeholder:text-t3 focus:border-primary disabled:opacity-50";

export function Input({ className = "", ...props }: React.InputHTMLAttributes<HTMLInputElement>) {
  return <input className={`h-10 px-3.5 ${inputBase} ${className}`} {...props} />;
}

export function Textarea({ className = "", ...props }: React.TextareaHTMLAttributes<HTMLTextAreaElement>) {
  return <textarea className={`min-h-[84px] px-3.5 py-2.5 ${inputBase} ${className}`} {...props} />;
}

export function Select({ className = "", ...props }: React.SelectHTMLAttributes<HTMLSelectElement>) {
  return <select className={`h-10 px-3 ${inputBase} ${className}`} {...props} />;
}

export function Field({
  label,
  hint,
  className = "",
  children,
}: {
  label: string;
  hint?: string;
  className?: string;
  children: React.ReactNode;
}) {
  return (
    <label className={`block ${className}`}>
      <span className="mb-1.5 flex items-baseline gap-2 text-xs font-medium text-t3">
        {label}
        {hint && <span className="text-[10.5px] font-normal">{hint}</span>}
      </span>
      {children}
    </label>
  );
}
