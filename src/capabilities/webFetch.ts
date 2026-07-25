import { DOMParser } from "@xmldom/xmldom";

import { beginExternalDispatch } from "./externalDispatch.js";
import { persistCapabilityEvidence } from "./evidence.js";
import { parseArgs, readString } from "../tools/core/shared.js";
import type { RegisteredTool } from "../tools/core/types.js";
import { truncateText } from "../utils/fs.js";
import {
  createWebRequestController,
  decodeResponseText,
  KnownWebResponseError,
  readBoundedResponse,
  readHttpUrl,
  updateWebHealth,
  WEB_EVIDENCE_MAX_BYTES,
  WEB_FETCH_MODEL_MAX_CHARS,
  WEB_FETCH_RESPONSE_MAX_BYTES,
  type WebDependencies,
} from "./webShared.js";

const TEXT_CONTENT_TYPE = /^(?:text\/|application\/(?:json|[^;]+\+json|xml|[^;]+\+xml|javascript|xhtml\+xml))/iu;
const RESPONSE_HEADERS = ["content-type", "content-length", "last-modified", "etag", "cache-control"] as const;

export function createWebFetchTool(dependencies: WebDependencies = {}): RegisteredTool {
  const fetchImpl = dependencies.fetch ?? fetch;
  return {
    definition: {
      type: "function",
      function: {
        name: "web_fetch",
        description: "Read an HTTP(S) page with a bounded text projection and durable response evidence. Use web_download for binary files.",
        parameters: {
          type: "object",
          properties: {
            url: { type: "string", description: "The HTTP(S) URL to read." },
          },
          required: ["url"],
          additionalProperties: false,
        },
      },
    },
    effect: "external",
    parallelSafe: false,
    async execute(rawArgs, context) {
      const requestedUrl = readHttpUrl(readString(parseArgs(rawArgs).url, "url").trim());
      const dispatch = beginExternalDispatch(context);
      if (!dispatch.shouldDispatch) {
        return dispatch.uncertain(new Error("The web read was already dispatched; Kitty will not replay it."));
      }
      const request = createWebRequestController(context.abortSignal, "Web read timed out.");
      let responseComplete = false;
      try {
        const response = await fetchImpl(requestedUrl, {
          method: "GET",
          headers: { accept: "text/html, application/xhtml+xml, application/json, text/plain, application/xml;q=0.9, */*;q=0.1", "user-agent": "Kitty web capability" },
          signal: request.signal,
        });
        const bytes = await readBoundedResponse(response, WEB_FETCH_RESPONSE_MAX_BYTES);
        responseComplete = true;
        const contentType = response.headers.get("content-type") ?? "application/octet-stream";
        if (!response.ok) {
          const detail = isTextContent(contentType) ? decodeResponseText(bytes, contentType).slice(0, 500) : "";
          throw new KnownWebResponseError(`Web read returned HTTP ${response.status}${detail ? `: ${detail}` : "."}`);
        }
        if (!isTextContent(contentType)) {
          throw new KnownWebResponseError(`Web read received ${contentType}; use web_download for binary content.`);
        }
        const rawText = decodeResponseText(bytes, contentType);
        const projection = projectText(rawText, contentType);
        const receivedAt = new Date().toISOString();
        const finalUrl = readHttpUrl(response.url || requestedUrl.toString()).toString();
        const headers = projectHeaders(response.headers);
        const evidence = await persistCapabilityEvidence({
          rootDir: context.projectContext.stateRootDir,
          capabilityId: "web",
          operationId: dispatch.operationId,
          value: {
            operationId: dispatch.operationId,
            requestedUrl: requestedUrl.toString(),
            finalUrl,
            receivedAt,
            status: response.status,
            headers,
            body: rawText,
          },
          retained: { operationId: dispatch.operationId, requestedUrl: requestedUrl.toString(), finalUrl, receivedAt, status: response.status, headers },
          maxBytes: WEB_EVIDENCE_MAX_BYTES,
        });
        updateWebHealth(context.projectContext.stateRootDir, "ready");
        return dispatch.settle({
          ok: true,
          output: JSON.stringify({
            ok: true,
            operationId: dispatch.operationId,
            requestedUrl: requestedUrl.toString(),
            finalUrl,
            status: response.status,
            headers,
            title: projection.title,
            text: truncateText(projection.text, WEB_FETCH_MODEL_MAX_CHARS),
            responseBytes: bytes.length,
            evidencePath: evidence.relativePath,
            evidenceBytes: evidence.bytes,
            evidenceTruncated: evidence.truncated,
          }, null, 2),
          metadata: { artifacts: [{ kind: "file", path: evidence.absolutePath, bytes: evidence.bytes, mimeType: "application/json" }] },
        });
      } catch (error) {
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

function isTextContent(contentType: string): boolean {
  return TEXT_CONTENT_TYPE.test(contentType.trim());
}

function projectText(source: string, contentType: string): { title?: string; text: string } {
  if (/text\/html|application\/xhtml\+xml/iu.test(contentType)) {
    const document = new DOMParser().parseFromString(source, "text/html");
    for (const tag of ["script", "style", "noscript", "svg"]) removeElements(document, tag);
    const title = normalizeWhitespace(document.getElementsByTagName("title")[0]?.textContent ?? "");
    const body = document.getElementsByTagName("body")[0] ?? document.documentElement;
    return { title: title || undefined, text: normalizeWhitespace(body?.textContent ?? "") };
  }
  if (/application\/(?:json|[^;]+\+json)/iu.test(contentType)) {
    try {
      return { text: JSON.stringify(JSON.parse(source), null, 2) };
    } catch {
      return { text: source };
    }
  }
  return { text: source };
}

function removeElements(document: Document, tagName: string): void {
  const elements = document.getElementsByTagName(tagName);
  while (elements.length > 0) elements[0]?.parentNode?.removeChild(elements[0]);
}

function normalizeWhitespace(value: string): string {
  return value.replace(/\s+/gu, " ").trim();
}

function projectHeaders(headers: Headers): Record<string, string> {
  return Object.fromEntries(RESPONSE_HEADERS.flatMap((name) => {
    const value = headers.get(name);
    return value ? [[name, value]] : [];
  }));
}
