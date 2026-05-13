"use client";

import { useState } from "react";
import { Copy, Check, Server, Sparkles } from "lucide-react";
import { toast } from "sonner";
import { Card } from "@/components/ui/card";
import { Button } from "@/components/ui/button";

export function ConnectInstructions() {
  const [copied, setCopied] = useState<string | null>(null);

  function getOrigin() {
    if (typeof window !== "undefined") return window.location.origin;
    return "https://orbit-drab-phi.vercel.app";
  }

  function copy(key: string, text: string) {
    navigator.clipboard.writeText(text).then(() => {
      setCopied(key);
      toast.success("Copied");
      setTimeout(() => setCopied(null), 1500);
    });
  }

  const origin = getOrigin();
  const mcpUrl = `${origin}/api/mcp`;
  const discoveryUrl = `${origin}/.well-known/oauth-authorization-server`;

  const desktopConfig = JSON.stringify(
    {
      mcpServers: {
        orbit: {
          url: mcpUrl,
        },
      },
    },
    null,
    2,
  );

  return (
    <Card className="p-6 flex flex-col gap-4">
      <div className="flex items-start gap-3">
        <div className="h-9 w-9 rounded-lg bg-violet-100 dark:bg-violet-950/40 flex items-center justify-center text-violet-700 dark:text-violet-300">
          <Server className="h-4 w-4" />
        </div>
        <div>
          <h2 className="text-base font-semibold">Connect a client</h2>
          <p className="text-xs text-muted-foreground mt-0.5">
            Point any MCP-aware client at the URL below. The client will walk
            you through the OAuth handshake — you&apos;ll land back here to
            approve scopes.
          </p>
        </div>
      </div>

      <div className="flex flex-col gap-2">
        <label className="text-xs font-medium uppercase tracking-wider text-muted-foreground">
          MCP server URL
        </label>
        <div className="flex items-center gap-2">
          <code className="flex-1 text-xs bg-secondary px-3 py-2 rounded-md font-mono break-all">
            {mcpUrl}
          </code>
          <Button
            size="sm"
            variant="outline"
            onClick={() => copy("url", mcpUrl)}
          >
            {copied === "url" ? (
              <Check className="h-3.5 w-3.5" />
            ) : (
              <Copy className="h-3.5 w-3.5" />
            )}
          </Button>
        </div>
      </div>

      <details className="text-sm">
        <summary className="cursor-pointer font-medium inline-flex items-center gap-2">
          <Sparkles className="h-3.5 w-3.5" />
          Claude Desktop config snippet
        </summary>
        <div className="mt-3 flex flex-col gap-2">
          <p className="text-xs text-muted-foreground">
            Paste into <code className="text-[11px]">~/Library/Application Support/Claude/claude_desktop_config.json</code>
            {" "}(macOS) or the Windows equivalent. Restart Claude Desktop after saving.
          </p>
          <div className="flex items-start gap-2">
            <pre className="flex-1 text-xs bg-secondary p-3 rounded-md overflow-x-auto whitespace-pre font-mono">
{desktopConfig}
            </pre>
            <Button
              size="sm"
              variant="outline"
              onClick={() => copy("config", desktopConfig)}
            >
              {copied === "config" ? (
                <Check className="h-3.5 w-3.5" />
              ) : (
                <Copy className="h-3.5 w-3.5" />
              )}
            </Button>
          </div>
        </div>
      </details>

      <details className="text-sm">
        <summary className="cursor-pointer font-medium">
          OAuth discovery URL (for manual config)
        </summary>
        <div className="mt-2 flex items-center gap-2">
          <code className="flex-1 text-xs bg-secondary px-3 py-2 rounded-md font-mono break-all">
            {discoveryUrl}
          </code>
          <Button
            size="sm"
            variant="outline"
            onClick={() => copy("discovery", discoveryUrl)}
          >
            {copied === "discovery" ? (
              <Check className="h-3.5 w-3.5" />
            ) : (
              <Copy className="h-3.5 w-3.5" />
            )}
          </Button>
        </div>
      </details>
    </Card>
  );
}
