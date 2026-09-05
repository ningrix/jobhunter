export const STAGE_LABELS: Record<string, string> = {
  wishlist: "想投",
  applied: "已投递",
  written_test: "笔试",
  interview: "面试",
  offer: "Offer",
  rejected: "已挂",
  closed: "关闭",
};

export const STAGE_ORDER = ["wishlist", "applied", "written_test", "interview", "offer", "rejected", "closed"] as const;

export type StageKey = (typeof STAGE_ORDER)[number];

export function stageColorVar(stage: string): string {
  return `var(--stage-${stage === "written_test" ? "written" : stage})`;
}

export function StageDot({ stage, className = "" }: { stage: string; className?: string }) {
  return <span className={`h-2 w-2 shrink-0 rounded-full ${className}`} style={{ background: stageColorVar(stage) }} />;
}
