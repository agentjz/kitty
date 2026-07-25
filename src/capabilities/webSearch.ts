import { DOMParser } from "@xmldom/xmldom";

import { beginExternalDispatch } from "./externalDispatch.js";
import { persistCapabilityEvidence } from "./evidence.js";
import { parseArgs, readString } from "../tools/core/shared.js";
import type { RegisteredTool } from "../tools/core/types.js";
import {
  createWebRequestController,
  decodeResponseText,
  KnownWebResponseError,
  readBoundedResponse,
  updateWebHealth,
  WEB_EVIDENCE_MAX_BYTES,
  WEB_SEARCH_RESPONSE_MAX_BYTES,
  WEB_SEARCH_RESULT_LIMIT,
  type WebDependencies,
} from "./webShared.js";

const BING_RSS_ENDPOINT = "https://www.bing.com/search";
const MAX_RESULT_FIELD_CHARS = 2_000;

interface WebSearchResult {
  title: string;
  url: string;
  snippet: string;
}

export function createWebSearchTool(dependencies: WebDependencies = {}): RegisteredTool {
  const fetchImpl = dependencies.fetch ?? fetch;
  return {
    definition: {
      type: "function",
      function: {
        name: "web_search",
        description: "Search the public web without credentials and return numbered results with durable RSS evidence.",
        parameters: {
          type: "object",
          properties: {
            query: { type: "string", description: "The web search query." },
          },
          required: ["query"],
          additionalProperties: false,
        },
      },
    },
    effect: "external",
    parallelSafe: false,
    async execute(rawArgs, context) {
      const query = readString(parseArgs(rawArgs).query, "query").trim();
      if (!query) throw new Error('Tool argument "query" must not be blank.');
      const dispatch = beginExternalDispatch(context);
      if (!dispatch.shouldDispatch) {
        return dispatch.uncertain(new Error("The search request was already dispatched; Kitty will not replay it."));
      }
      const request = createWebRequestController(context.abortSignal, "Web search timed out.");
      let responseComplete = false;
      try {
        const url = new URL(BING_RSS_ENDPOINT);
        url.searchParams.set("format", "rss");
        url.searchParams.set("q", query);
        const response = await fetchImpl(url, {
          method: "GET",
          headers: {
            accept: "application/rss+xml, application/xml;q=0.9, text/xml;q=0.8",
            "user-agent": "Kitty web capability",
          },
          signal: request.signal,
        });
        const bytes = await readBoundedResponse(response, WEB_SEARCH_RESPONSE_MAX_BYTES);
        responseComplete = true;
        const rawXml = decodeResponseText(bytes, response.headers.get("content-type") ?? "text/xml; charset=utf-8");
        if (!response.ok) {
          throw new KnownWebResponseError(`Bing search returned HTTP ${response.status}: ${rawXml.slice(0, 500)}`);
        }
        const results = parseBingRss(rawXml).slice(0, WEB_SEARCH_RESULT_LIMIT);
        const receivedAt = new Date().toISOString();
        const evidence = await persistCapabilityEvidence({
          rootDir: context.projectContext.stateRootDir,
          capabilityId: "web",
          operationId: dispatch.operationId,
          value: {
            operationId: dispatch.operationId,
            query,
            receivedAt,
            endpoint: url.toString(),
            responseXml: rawXml,
          },
          retained: { operationId: dispatch.operationId, query, receivedAt, endpoint: url.toString() },
          maxBytes: WEB_EVIDENCE_MAX_BYTES,
        });
        updateWebHealth(context.projectContext.stateRootDir, "ready");
        return dispatch.settle({
          ok: true,
          output: JSON.stringify({
            ok: true,
            operationId: dispatch.operationId,
            query,
            results: results.map((result, index) => ({ id: index + 1, ...result })),
            evidencePath: evidence.relativePath,
            evidenceBytes: evidence.bytes,
            evidenceTruncated: evidence.truncated,
            noResults: results.length === 0,
          }, null, 2),
          metadata: {
            artifacts: [{ kind: "file", path: evidence.absolutePath, bytes: evidence.bytes, mimeType: "application/json" }],
          },
        });
      } catch (error) {
        updateWebHealth(context.projectContext.stateRootDir, "degraded", error instanceof Error ? error.message : String(error));
        return responseComplete || error instanceof KnownWebResponseError
          ? dispatch.fail(error)
          : dispatch.uncertain(error);
      } finally {
        request.close();
        dispatch.close();
      }
    },
  };
}

function parseBingRss(source: string): WebSearchResult[] {
  const errors: string[] = [];
  const document = new DOMParser({
    errorHandler: {
      warning: () => undefined,
      error: (message) => errors.push(String(message)),
      fatalError: (message) => errors.push(String(message)),
    },
  }).parseFromString(source, "application/xml");
  if (errors.length > 0 || document.documentElement?.tagName.toLowerCase() !== "rss") {
    throw new KnownWebResponseError(`Bing search returned invalid RSS XML${errors[0] ? `: ${errors[0]}` : "."}`);
  }
  return Array.from(document.getElementsByTagName("item")).flatMap((item): WebSearchResult[] => {
    const title = childText(item, "title");
    const rawUrl = childText(item, "link");
    if (!title || !rawUrl) return [];
    let url: URL;
    try {
      url = new URL(rawUrl);
    } catch {
      return [];
    }
    if (url.protocol !== "http:" && url.protocol !== "https:") return [];
    return [{
      title: limit(normalizeWhitespace(title), MAX_RESULT_FIELD_CHARS),
      url: url.toString(),
      snippet: limit(normalizeWhitespace(childText(item, "description")), MAX_RESULT_FIELD_CHARS),
    }];
  });
}

function childText(parent: Element, tagName: string): string {
  for (const child of Array.from(parent.childNodes)) {
    if (child.nodeType === 1 && (child as Element).tagName.toLowerCase() === tagName) {
      return child.textContent?.trim() ?? "";
    }
  }
  return "";
}

function normalizeWhitespace(value: string): string {
  return value.replace(/\s+/gu, " ").trim();
}

function limit(value: string, maxChars: number): string {
  return value.length <= maxChars ? value : `${value.slice(0, maxChars - 3)}...`;
}
