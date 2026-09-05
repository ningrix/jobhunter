export function PageHeader({ title, desc, right }: { title: string; desc?: string; right?: React.ReactNode }) {
  return (
    <div className="flex flex-wrap items-end justify-between gap-2">
      <div>
        <h1 className="text-[23px] font-bold leading-tight text-t1">{title}</h1>
        {desc && <p className="mt-1 text-[12.5px] text-t3">{desc}</p>}
      </div>
      {right}
    </div>
  );
}
