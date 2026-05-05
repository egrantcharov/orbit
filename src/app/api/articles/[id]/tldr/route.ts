import { auth } from "@clerk/nextjs/server";
import { NextResponse, type NextRequest } from "next/server";
import { createSupabaseServiceClient } from "@/lib/supabase/service";
import { fetchArticleMarkdown } from "@/lib/jina/extract";
import { generateTldr } from "@/lib/anthropic/tldr";

export const maxDuration = 30;

export async function POST(
  _req: NextRequest,
  ctx: { params: Promise<{ id: string }> },
) {
  const { userId } = await auth();
  if (!userId) {
    return NextResponse.json({ error: "unauthorized" }, { status: 401 });
  }
  const { id } = await ctx.params;
  const supabase = createSupabaseServiceClient();

  const { data: article } = await supabase
    .from("articles")
    .select(
      "id, url, title, author, snippet, content_excerpt, published_at, tldr, tldr_takeaways, publication_id",
    )
    .eq("clerk_user_id", userId)
    .eq("id", id)
    .maybeSingle();
  if (!article) {
    return NextResponse.json({ error: "not_found" }, { status: 404 });
  }

  const { data: pub } = await supabase
    .from("publications")
    .select("name")
    .eq("clerk_user_id", userId)
    .eq("id", article.publication_id)
    .maybeSingle();

  // Use cached body if we already have it; otherwise fetch via Jina.
  let content = article.content_excerpt ?? "";
  if (content.length < 400) {
    const markdown = await fetchArticleMarkdown(article.url);
    if (markdown.length > 0) {
      content = markdown;
      // Cache the fetched body so future TLDRs don't re-fetch.
      await supabase
        .from("articles")
        .update({ content_excerpt: markdown.slice(0, 30_000) })
        .eq("id", article.id);
    }
  }

  if (content.trim().length < 200) {
    return NextResponse.json(
      {
        error: "no_content",
        message:
          "Couldn't fetch enough article body to summarize. The site may block scrapers.",
      },
      { status: 400 },
    );
  }

  try {
    const result = await generateTldr({
      title: article.title,
      author: article.author,
      publishedAt: article.published_at,
      publication: pub?.name ?? "(unknown)",
      content,
    });
    await supabase
      .from("articles")
      .update({
        tldr: result.tldr,
        tldr_takeaways: result.takeaways,
        tldr_at: new Date().toISOString(),
      })
      .eq("id", article.id);
    return NextResponse.json({ ok: true, ...result });
  } catch (err) {
    console.error("tldr failed", {
      userId,
      articleId: id,
      msg: err instanceof Error ? err.message : String(err),
    });
    return NextResponse.json({ error: "tldr_failed" }, { status: 500 });
  }
}
