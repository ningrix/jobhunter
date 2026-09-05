/** 页面环境光斑：右上 indigo / 左下 violet 两团径向渐变（概念稿氛围层） */
export function AmbientGlow() {
  return (
    <div aria-hidden className="pointer-events-none fixed inset-0 z-0 overflow-hidden">
      <div className="glow-a absolute -right-28 -top-36 h-[380px] w-[380px] rounded-full" />
      <div className="glow-b absolute -bottom-40 -left-28 h-[380px] w-[380px] rounded-full" />
    </div>
  );
}
