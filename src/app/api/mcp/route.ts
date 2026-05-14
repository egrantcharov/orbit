/**
 * The Orbit MCP server.
 *
 * `mcp-handler` wires the Streamable HTTP + JSON-RPC plumbing. We provide:
 *   - `verifyToken`     resolves the Bearer to a clerk_user_id + scopes
 *   - `initializeServer` registers tools/prompts/resources for THIS request
 *     using the resolved context
 *
 * Auth is required on every call (no anonymous tool list — even discovery
 * needs a valid bearer, per MCP's auth profile). Clients that hit this
 * endpoint without a token get a 401 with a WWW-Authenticate header
 * pointing at our OAuth discovery doc.
 */
import { createMcpHandler, withMcpAuth } from "mcp-handler";
import { validateBearer, parseBearer } from "@/lib/mcp/auth";
import { registerOrbitTools } from "@/lib/mcp/server";
import { checkRateLimit } from "@/lib/security/rateLimit";

export const dynamic = "force-dynamic";
export const maxDuration = 60;

const MCP_GLOBAL_LIMIT_PER_MIN = 600;

const baseHandler = createMcpHandler(
  // initializeServer — called per request. McpAuthContext is grabbed off the
  // SDK's `extraArgs` via a closure variable on the wrapped request below.
  () => {
    // No-op default — tools get registered inside `handlerWithCtx` below
    // where we have access to the resolved auth context.
  },
  {},
  {
    maxDuration: 60,
    verboseLogs: false,
  },
);

// The tricky bit: mcp-handler's `initializeServer` runs *before* request
// auth is resolved by `withMcpAuth`. We need the userId/scopes inside the
// server factory. Solution: wrap createMcpHandler ourselves with a fresh
// per-request server.
//
// We do this by re-creating the handler per request (small cost — registering
// 6 tools is microseconds). Each request gets its own factory closure with
// the right context.
async function dispatch(req: Request): Promise<Response> {
  const ctx = await validateBearer(req.headers.get("authorization"));
  if (!ctx) {
    const origin = new URL(req.url).origin;
    return new Response(
      JSON.stringify({ error: "unauthorized" }),
      {
        status: 401,
        headers: {
          "content-type": "application/json",
          "www-authenticate": `Bearer realm="orbit", as_uri="${origin}/.well-known/oauth-authorization-server"`,
        },
      },
    );
  }

  // Global per-user MCP rate-limit.
  const rl = checkRateLimit(`mcp:${ctx.userId}`, MCP_GLOBAL_LIMIT_PER_MIN, 60_000);
  if (!rl.allowed) {
    return new Response(
      JSON.stringify({ error: "rate_limited" }),
      {
        status: 429,
        headers: {
          "content-type": "application/json",
          "retry-after": String(rl.retryAfterSeconds),
        },
      },
    );
  }

  const perRequestHandler = createMcpHandler(
    (server) => {
      registerOrbitTools(server, ctx);
    },
    {
      // Server metadata returned in MCP initialize response.
      capabilities: {
        tools: {},
      },
    },
    {
      maxDuration: 60,
      verboseLogs: false,
      // Stateless request/response. We don't have Redis provisioned and
      // the P0 tools don't need server-pushed notifications. SSE comes
      // back when we ship resource subscriptions in P2.
      disableSse: true,
    },
  );
  return perRequestHandler(req);
}

export { dispatch as GET, dispatch as POST, dispatch as DELETE };

// Silence the unused-import warning — kept around in case we wire withMcpAuth
// later for SDK-provided auth helpers.
void withMcpAuth;
void parseBearer;
void baseHandler;
