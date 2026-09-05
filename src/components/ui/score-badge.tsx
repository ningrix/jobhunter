import { Badge } from "./badge";

export function ScoreBadge({ score, className = "" }: { score: number; className?: string }) {
  const tone = score >= 75 ? "success" : score >= 55 ? "warn" : "danger";
  return (
    <Badge tone={tone} className={className}>
      {score} 分
    </Badge>
  );
}
