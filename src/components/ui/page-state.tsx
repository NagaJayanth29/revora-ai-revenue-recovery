import { cn } from "@/lib/utils";
import { Button } from "@/components/ui/button";

export function PageState({
  loading,
  error,
  empty,
  emptyTitle = "Nothing here yet",
  emptyBody,
  onRetry,
  children,
  className,
}: {
  loading?: boolean;
  error?: string | null;
  empty?: boolean;
  emptyTitle?: string;
  emptyBody?: string;
  onRetry?: () => void;
  children: React.ReactNode;
  className?: string;
}) {
  if (loading) {
    return (
      <div className={cn("space-y-3", className)}>
        {[1, 2, 3].map((i) => (
          <div
            key={i}
            className="h-24 animate-pulse rounded-lg border border-revora-border-subtle bg-revora-surface/60"
          />
        ))}
      </div>
    );
  }

  if (error) {
    return (
      <div
        className={cn(
          "rounded-lg border border-revora-danger/30 bg-revora-surface px-5 py-8 text-center",
          className
        )}
      >
        <p className="text-sm text-revora-text">{error}</p>
        {onRetry && (
          <Button className="mt-4" variant="secondary" onClick={onRetry}>
            Retry
          </Button>
        )}
      </div>
    );
  }

  if (empty) {
    return (
      <div
        className={cn(
          "rounded-lg border border-revora-border-subtle bg-revora-surface px-5 py-10 text-center",
          className
        )}
      >
        <p className="text-sm font-medium text-revora-text">{emptyTitle}</p>
        {emptyBody && <p className="mt-2 text-xs text-revora-muted">{emptyBody}</p>}
      </div>
    );
  }

  return <>{children}</>;
}

export function SectionLabel({ children }: { children: React.ReactNode }) {
  return (
    <div className="text-[10px] font-medium uppercase tracking-[0.18em] text-revora-faint">
      {children}
    </div>
  );
}
