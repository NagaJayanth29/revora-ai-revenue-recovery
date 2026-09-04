/** Shared cache policy for live Supabase-backed API routes. */
export const dynamic = "force-dynamic";
export const revalidate = 0;

export function jsonNoStore(data: unknown, init?: { status?: number }) {
  return Response.json(data, {
    status: init?.status ?? 200,
    headers: {
      "Cache-Control": "no-store, no-cache, must-revalidate, max-age=0",
      Pragma: "no-cache",
    },
  });
}
