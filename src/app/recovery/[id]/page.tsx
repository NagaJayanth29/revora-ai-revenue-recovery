import { redirect } from "next/navigation";

export default async function RecoveryDetailAliasPage({
  params,
}: {
  params: Promise<{ id: string }>;
}) {
  const { id } = await params;
  redirect(`/opportunities/${id}`);
}
