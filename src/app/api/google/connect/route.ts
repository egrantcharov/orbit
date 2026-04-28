import { auth } from "@clerk/nextjs/server";
import { NextResponse } from "next/server";
import { createOAuth2Client, GOOGLE_SCOPES } from "@/lib/google/oauth";

export async function GET() {
  const { userId } = await auth();
  if (!userId) {
    return NextResponse.json({ error: "unauthorized" }, { status: 401 });
  }

  const client = createOAuth2Client();
  const url = client.generateAuthUrl({
    access_type: "offline",
    prompt: "consent",
    include_granted_scopes: true,
    scope: GOOGLE_SCOPES,
    state: userId,
  });

  return NextResponse.redirect(url);
}
