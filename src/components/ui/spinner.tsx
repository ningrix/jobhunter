import { Loader2 } from "lucide-react";

export function Spinner({ className = "" }: { className?: string }) {
  return <Loader2 size={16} className={`animate-spin ${className}`} />;
}

export function Loading({ text = "加载中…", className = "" }: { text?: string; className?: string }) {
  return (
    <div className={`flex items-center gap-2 py-10 text-sm text-t3 ${className}`}>
      <Spinner />
      {text}
    </div>
  );
}
