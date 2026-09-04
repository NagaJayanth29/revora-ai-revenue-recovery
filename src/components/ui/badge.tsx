import { cn } from "@/lib/utils";

export function Badge({
  children,
  tone = "muted",
  className,
}: {
  children: React.ReactNode;
  tone?: "success" | "danger" | "amber" | "info" | "muted";
  className?: string;
}) {
  const tones = {
    success: "text-revora-success border-revora-success/30 bg-revora-success/10",
    danger: "text-revora-danger border-revora-danger/30 bg-revora-danger/10",
    amber: "text-revora-amber border-revora-amber/30 bg-revora-amber/10",
    info: "text-revora-info border-revora-info/30 bg-revora-info/10",
    muted: "text-revora-muted border-revora-border bg-revora-elevated",
  };
  return (
    <span
      className={cn(
        "inline-flex items-center rounded border px-2 py-0.5 text-[11px] font-medium uppercase tracking-wide",
        tones[tone],
        className
      )}
    >
      {children}
    </span>
  );
}
