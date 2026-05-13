import { clerkMiddleware, createRouteMatcher } from "@clerk/nextjs/server";

const isProtectedRoute = createRouteMatcher(["/app(.*)", "/api/(.*)"]);
// Routes that bypass Clerk's auth.protect(). They may still call auth()
// internally — but the proxy must NOT redirect when there's no session.
// /api/mcp(.*) uses bearer tokens; OAuth endpoints handle their own logic.
const isPublicApiRoute = createRouteMatcher([
  "/api/google/callback",
  "/api/mcp(.*)",
]);

export default clerkMiddleware(async (auth, req) => {
  if (isPublicApiRoute(req)) return;
  if (isProtectedRoute(req)) await auth.protect();
});

export const config = {
  matcher: [
    "/((?!_next|[^?]*\\.(?:html?|css|js(?!on)|jpe?g|webp|png|gif|svg|ttf|woff2?|ico|csv|docx?|xlsx?|zip|webmanifest)).*)",
    "/(api|trpc)(.*)",
  ],
};
