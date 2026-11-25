import { createHash } from "node:crypto";
import type OpenAI from "openai";
import {
  academyWebInstructions,
  academyWebResults,
  universityDomains,
  universityUrl,
  type WebAcademySource,
} from "../academy-web-research.js";
import { assertClean, UserError } from "./safety.js";

export function citationsFromSearch(
  output: OpenAI.Responses.Response["output"],
) {
  if (
    !output.some(
      (item) => item.type === "web_search_call" && item.status === "completed",
    )
  )
    return [];
  const sources = new Map<string, WebAcademySource>();
  for (const item of output) {
    if (item.type !== "message") continue;
    for (const content of item.content) {
      if (content.type !== "output_text") continue;
      const paragraphs = [
        ...content.text.matchAll(/[^\n](?:[^\n]|\n(?!\n))*/g),
      ].map((match) => ({ text: match[0].trim(), index: match.index }));
      for (const link of content.annotations) {
        if (link.type !== "url_citation") continue;
        const url = universityUrl(link.url);
        const paragraph = paragraphs.findLast(
          ({ index }) => index <= link.start_index,
        );
        if (!url || !paragraph?.text || link.start_index > content.text.length)
          continue;
        url.search = "";
        url.hash = "";
        const href = url.href;
        if (sources.has(href) || href.length > 2000) continue;
        sources.set(href, {
          id: `web:${createHash("sha256").update(href).digest("hex").slice(0, 16)}`,
          title: link.title.trim().slice(0, 300) || url.hostname,
          url: href,
          text: paragraph.text
            .replace(/\[([^\]]+)\]\(https?:\/\/[^)]+\)/g, "$1")
            .slice(0, 1000),
        });
        if (sources.size === 6) return [...sources.values()];
      }
    }
  }
  return [...sources.values()];
}

export async function searchAcademy(
  client: OpenAI,
  model: string,
  topic: string,
) {
  if (!topic.trim() || topic.length > 1600)
    throw new UserError("Choose a focused topic for university research.");
  assertClean(topic, "university search");
  // Responses accepts this limit even though the installed SDK omits it from create params.
  const request: OpenAI.Responses.ResponseCreateParamsNonStreaming & {
    max_tool_calls: number;
  } = {
    model,
    store: false,
    instructions: academyWebInstructions,
    input: `Find teaching approaches relevant to this topic: ${JSON.stringify(topic)}`,
    tools: [
      {
        type: "web_search",
        filters: { allowed_domains: universityDomains },
        search_context_size: "medium",
      },
    ],
    tool_choice: "required",
    max_tool_calls: 3,
    max_output_tokens: 3200,
  };
  const response = await client.responses.create(request, { timeout: 75000 });
  const sources = citationsFromSearch(response.output);
  if (!sources.length)
    throw new UserError(
      "University search found no cited course material. Try a narrower topic or turn off online research.",
      422,
    );
  assertClean(JSON.stringify(sources), "university search results");
  return academyWebResults.parse(sources);
}
