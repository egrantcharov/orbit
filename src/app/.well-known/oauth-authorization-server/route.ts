/**
 * OAuth 2.1 Authorization Server Metadata (RFC 8414).
 *
 * MCP clients fetch this to discover the authorize/token endpoints and
 * what auth methods + scopes Orbit supports. The MCP spec requires this
 * file to live at /.well-known/oauth-authorization-server (or beside the
 * MCP resource URL).
 */
import { NextResponse, type NextRequest } from "next/server";
import { ALL_SCOPES } from "@/lib/mcp/scopes";

export const dynamic = "force-dynamic";

export async function GET(req: NextRequest) {
  const origin = new URL(req.url).origin;
  return NextResponse.json({
    issuer: origin,
    authorization_endpoint: `${origin}/api/mcp/oauth/authorize`,
    token_endpoint: `${origin}/api/mcp/oauth/token`,
    registration_endpoint: `${origin}/api/mcp/oauth/register`,
    revocation_endpoint: `${origin}/api/mcp/oauth/revoke`,
    scopes_supported: ALL_SCOPES,
    response_types_supported: ["code"],
    grant_types_supported: ["authorization_code", "refresh_token"],
    code_challenge_methods_supported: ["S256"],
    token_endpoint_auth_methods_supported: [
      "client_secret_post",
      "client_secret_basic",
      "none", // public clients (Claude Desktop) using PKCE
    ],
    revocation_endpoint_auth_methods_supported: [
      "client_secret_post",
      "none",
    ],
    service_documentation: `${origin}/app/settings/mcp`,
  });
}
