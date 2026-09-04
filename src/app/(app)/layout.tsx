import { ClientShell } from "@/components/layout/client-shell";

export const dynamic = "force-dynamic";

export default function AppGroupLayout({ children }: { children: React.ReactNode }) {
  return <ClientShell>{children}</ClientShell>;
}
