import { auth } from "@clerk/nextjs/server";
import { NextResponse } from "next/server";

// v3: auto-discovery sync is gone. Clients should call /api/enrich/batch
// per contact. We keep this endpoint as a 410 so the v2 SyncControl button
// surfaces a clear "use Enrich" message if it gets clicked during the
// transition.
export async function POST() {
  const { userId } = await auth();
  if (!userId) {
    return NextResponse.json({ error: "unauthorized" }, { status: 401 });
  }
  return NextResponse.json(
    {
      error: "sync_removed",
      message:
        "Auto-discovery sync removed in v3. Use Enrich to find threads for known contacts.",
    },
    { status: 410 },
  );
}
