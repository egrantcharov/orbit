#!/usr/bin/env tsx
/**
 * MCP smoke test. Exercises the deployed Orbit MCP server end-to-end.
 *
 * Usage:
 *   MCP_TOKEN=orbit_pat_... npm run smoke:mcp
 *   MCP_URL=http://localhost:3000/api/mcp MCP_TOKEN=... npm run smoke:mcp
 *
 * Verifies:
 *   - unauth call returns 401 + WWW-Authenticate
 *   - initialize succeeds
 *   - tools/list returns 6 tools
 *   - get_today_cards executes
 *   - get_contact_stats executes
 *   - search_contacts executes with a basic filter
 *   - log_interaction is blocked when scope is missing (informational)
 */

const MCP_URL = process.env.MCP_URL ?? "https://orbit-drab-phi.vercel.app/api/mcp";
const TOKEN = process.env.MCP_TOKEN;

if (!TOKEN) {
  console.error(
    "Set MCP_TOKEN=<orbit_pat_…> (generate one at /app/settings/mcp).",
  );
  process.exit(1);
}

let counter = 1;
function nextId() {
  return counter++;
}

async function rpc(method: string, params?: unknown, opts: { withAuth?: boolean } = {}) {
  const res = await fetch(MCP_URL, {
    method: "POST",
    headers: {
      "content-type": "application/json",
      accept: "application/json, text/event-stream",
      ...(opts.withAuth === false ? {} : { authorization: `Bearer ${TOKEN}` }),
    },
    body: JSON.stringify({ jsonrpc: "2.0", id: nextId(), method, params }),
  });
  const text = await res.text();
  let body: unknown;
  try {
    body = JSON.parse(text);
  } catch {
    body = text;
  }
  return { status: res.status, headers: Object.fromEntries(res.headers), body };
}

async function main() {
  const results: Array<{ name: string; ok: boolean; detail: string }> = [];

  // ---- 1) unauthenticated call ----------------------------------------
  {
    const r = await fetch(MCP_URL, { method: "POST", headers: { "content-type": "application/json" }, body: "{}" });
    const ok = r.status === 401 && (r.headers.get("www-authenticate") ?? "").startsWith("Bearer");
    results.push({
      name: "unauth 401 + WWW-Authenticate",
      ok,
      detail: `status=${r.status} www-authenticate=${r.headers.get("www-authenticate")}`,
    });
  }

  // ---- 2) initialize ---------------------------------------------------
  {
    const r = await rpc("initialize", {
      protocolVersion: "2025-03-26",
      clientInfo: { name: "orbit-smoke", version: "1.0.0" },
      capabilities: {},
    });
    const body = r.body as { result?: { serverInfo?: { name?: string } }; error?: { message?: string } };
    const ok = r.status === 200 && !!body.result;
    results.push({
      name: "initialize",
      ok,
      detail: ok
        ? `serverInfo=${body.result?.serverInfo?.name ?? "(unknown)"}`
        : `status=${r.status} error=${body.error?.message ?? JSON.stringify(body)}`,
    });
  }

  // ---- 3) tools/list ---------------------------------------------------
  {
    const r = await rpc("tools/list");
    const body = r.body as { result?: { tools?: Array<{ name: string }> }; error?: unknown };
    const tools = body.result?.tools ?? [];
    const ok = r.status === 200 && tools.length >= 6;
    results.push({
      name: `tools/list — ${tools.length} tools`,
      ok,
      detail: ok
        ? tools.map((t) => t.name).join(", ")
        : `status=${r.status} body=${JSON.stringify(body).slice(0, 200)}`,
    });
  }

  // ---- 4) tools/call get_today_cards -----------------------------------
  {
    const r = await rpc("tools/call", {
      name: "get_today_cards",
      arguments: {},
    });
    const body = r.body as {
      result?: { content?: Array<{ type: string; text?: string }>; isError?: boolean };
      error?: unknown;
    };
    const text = body.result?.content?.[0]?.text ?? "";
    let cards = 0;
    try {
      const parsed = JSON.parse(text);
      cards = Array.isArray(parsed.cards) ? parsed.cards.length : 0;
    } catch {
      // not JSON
    }
    const ok = r.status === 200 && !body.result?.isError;
    results.push({
      name: `tools/call get_today_cards — ${cards} cards`,
      ok,
      detail: ok ? text.slice(0, 240) : JSON.stringify(body).slice(0, 240),
    });
  }

  // ---- 5) tools/call get_contact_stats --------------------------------
  {
    const r = await rpc("tools/call", {
      name: "get_contact_stats",
      arguments: {},
    });
    const body = r.body as {
      result?: { content?: Array<{ type: string; text?: string }>; isError?: boolean };
    };
    const ok = r.status === 200 && !body.result?.isError;
    results.push({
      name: "tools/call get_contact_stats",
      ok,
      detail: body.result?.content?.[0]?.text?.slice(0, 240) ?? JSON.stringify(body).slice(0, 240),
    });
  }

  // ---- 6) tools/call search_contacts ----------------------------------
  {
    const r = await rpc("tools/call", {
      name: "search_contacts",
      arguments: { is_pinned: true, order_by: "last_interaction_at" },
    });
    const body = r.body as {
      result?: { content?: Array<{ type: string; text?: string }>; isError?: boolean };
    };
    const text = body.result?.content?.[0]?.text ?? "";
    let count = 0;
    try {
      count = JSON.parse(text).count ?? 0;
    } catch {
      // not JSON
    }
    const ok = r.status === 200 && !body.result?.isError;
    results.push({
      name: `tools/call search_contacts (pinned) — ${count} matches`,
      ok,
      detail: text.slice(0, 240),
    });
  }

  // ---- 7) tools/call log_interaction (write — checks scope) -----------
  {
    const r = await rpc("tools/call", {
      name: "log_interaction",
      arguments: { contact_id: "00000000-0000-0000-0000-000000000000", body: "smoke test" },
    });
    const body = r.body as {
      result?: { content?: Array<{ type: string; text?: string }>; isError?: boolean };
    };
    const text = body.result?.content?.[0]?.text ?? "";
    // We expect either "contact not found" (token had write scope) or a missing-scope
    // error. Either is a healthy response — the dispatch made it through.
    const ok = r.status === 200;
    results.push({
      name: "tools/call log_interaction (expected: scope or not-found error)",
      ok,
      detail: text.slice(0, 240),
    });
  }

  // ---- Report ----------------------------------------------------------
  console.log("\n=== Orbit MCP smoke test ===");
  console.log(`Target: ${MCP_URL}`);
  for (const r of results) {
    const mark = r.ok ? "✓" : "✗";
    console.log(`${mark} ${r.name}`);
    if (r.detail) console.log(`   ${r.detail}`);
  }
  const failed = results.filter((r) => !r.ok).length;
  console.log(`\n${results.length - failed}/${results.length} passed.`);
  process.exit(failed > 0 ? 1 : 0);
}

main().catch((err) => {
  console.error("smoke failed:", err);
  process.exit(1);
});
