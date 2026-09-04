"use client";

import { usePathname } from "next/navigation";
import { AppShell } from "@/components/layout/app-shell";
import { CommandPalette } from "@/components/layout/command-palette";
import { AskRevoraDrawer } from "@/components/copilot/ask-revora-drawer";

export function ClientShell({ children }: { children: React.ReactNode }) {
  const pathname = usePathname();
  return (
    <AppShell pathname={pathname}>
      <CommandPalette />
      <AskRevoraDrawer />
      {children}
    </AppShell>
  );
}
