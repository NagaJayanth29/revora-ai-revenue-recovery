"use client";

import { useEffect, useState } from "react";
import { useRouter } from "next/navigation";
import { Command } from "cmdk";
import { cn } from "@/lib/utils";

const COMMANDS = [
  { id: "home", label: "Open Command Center", href: "/command-center", group: "Navigate" },
  { id: "queue", label: "Open Recovery Queue", href: "/queue", group: "Navigate" },
  {
    id: "approvals",
    label: "View pending approvals",
    href: "/queue?filter=NEEDS_APPROVAL",
    group: "Actions",
  },
  { id: "analytics", label: "Open Analytics", href: "/analytics", group: "Navigate" },
  { id: "experiments", label: "Open Experiments", href: "/experiments", group: "Navigate" },
  { id: "reliability", label: "Open Reliability Center", href: "/reliability", group: "Navigate" },
  { id: "failure", label: "Open Failure Lab", href: "/failure-lab", group: "Actions" },
  { id: "policies", label: "Open Policies", href: "/policies", group: "Navigate" },
  { id: "copilot", label: "Ask Copilot", href: "/copilot", group: "Actions" },
  {
    id: "hero",
    label: "Open ₹48,000 hero opportunity",
    href: "/queue?q=48000",
    group: "Actions",
  },
];

export function CommandPalette() {
  const [open, setOpen] = useState(false);
  const router = useRouter();

  useEffect(() => {
    const onKey = (e: KeyboardEvent) => {
      if ((e.metaKey || e.ctrlKey) && e.key.toLowerCase() === "k") {
        e.preventDefault();
        setOpen((v) => !v);
      }
      if (e.key === "Escape") setOpen(false);
    };
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  }, []);

  if (!open) return null;

  const groups = ["Navigate", "Actions"];

  return (
    <div className="fixed inset-0 z-50 flex items-start justify-center bg-black/60 pt-[18vh] backdrop-blur-sm">
      <button className="absolute inset-0 cursor-default" aria-label="Close" onClick={() => setOpen(false)} />
      <Command
        className="relative z-10 w-full max-w-lg overflow-hidden rounded-xl border border-revora-border bg-revora-surface shadow-2xl"
        label="Command palette"
      >
        <Command.Input
          placeholder="Jump to a page or action…"
          className="h-12 w-full border-b border-revora-border-subtle bg-transparent px-4 text-sm outline-none placeholder:text-revora-faint"
          autoFocus
        />
        <Command.List className="max-h-80 overflow-auto p-2">
          <Command.Empty className="px-3 py-6 text-center text-sm text-revora-muted">
            No matching commands.
          </Command.Empty>
          {groups.map((group) => (
            <Command.Group
              key={group}
              heading={group}
              className="px-2 py-1 text-[10px] uppercase tracking-wider text-revora-faint"
            >
              {COMMANDS.filter((c) => c.group === group).map((cmd) => (
                <Command.Item
                  key={cmd.id}
                  value={cmd.label}
                  onSelect={() => {
                    setOpen(false);
                    router.push(cmd.href);
                  }}
                  className={cn(
                    "flex cursor-pointer items-center rounded-md px-3 py-2 text-sm text-revora-muted aria-selected:bg-revora-elevated aria-selected:text-revora-text"
                  )}
                >
                  {cmd.label}
                </Command.Item>
              ))}
            </Command.Group>
          ))}
        </Command.List>
        <div className="border-t border-revora-border-subtle px-4 py-2 text-[11px] text-revora-faint">
          <kbd className="rounded border border-revora-border px-1">Esc</kbd> close ·{" "}
          <kbd className="rounded border border-revora-border px-1">⌘K</kbd> toggle
        </div>
      </Command>
    </div>
  );
}
