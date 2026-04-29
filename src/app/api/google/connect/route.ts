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
    // `select_account` forces Google's account picker even when the user is
    // already signed in to a Google account in this browser; `consent` then
    // forces the scope grant so we always get a refresh token back.
    prompt: "select_account consent",
    include_granted_scopes: true,
    scope: GOOGLE_SCOPES,
    state: userId,
  });

  return NextResponse.redirect(url);
}
