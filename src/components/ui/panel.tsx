import { cn } from "@/lib/utils";

export function Panel({
  children,
  className,
  title,
  subtitle,
  action,
}: {
  children: React.ReactNode;
  className?: string;
  title?: string;
  subtitle?: string;
  action?: React.ReactNode;
}) {
  return (
    <section
      className={cn(
        "rounded-lg border border-revora-border-subtle bg-revora-surface/80",
        className
      )}
    >
      {(title || action) && (
        <header className="flex items-start justify-between gap-4 border-b border-revora-border-subtle px-5 py-4">
          <div>
            {title && (
              <h2 className="text-sm font-medium tracking-wide text-revora-text">{title}</h2>
            )}
            {subtitle && <p className="mt-1 text-xs text-revora-muted">{subtitle}</p>}
          </div>
          {action}
        </header>
      )}
      <div className="p-5">{children}</div>
    </section>
  );
}
