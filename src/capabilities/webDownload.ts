import { beginExternalDispatch } from "./externalDispatch.js";
import { parseArgs, readString } from "../tools/core/shared.js";
import { toToolRelativePath } from "../tools/core/pathDisplay.js";
import type { RegisteredTool } from "../tools/core/types.js";
import { atomicWriteFile, ensureParentDirectory, fileExists, resolveUserPath, sha256Content } from "../utils/fs.js";
import {
  createWebRequestController,
  decodeResponseText,
  KnownWebResponseError,
  readBoundedResponse,
  readHttpUrl,
  updateWebHealth,
  WEB_DOWNLOAD_MAX_BYTES,
  type WebDependencies,
} from "./webShared.js";

const ERROR_RESPONSE_MAX_BYTES = 64_000;

export function createWebDownloadTool(dependencies: WebDependencies = {}): RegisteredTool {
  const fetchImpl = dependencies.fetch ?? fetch;
  return {
    definition: {
      type: "function",
      function: {
        name: "web_download",
        description: "Download an HTTP(S) resource to a file with a hard size limit and atomic replacement.",
        parameters: {
          type: "object",
          properties: {
            url: { type: "string", description: "The HTTP(S) resource URL." },
            path: { type: "string", description: "Destination file path." },
          },
          required: ["url", "path"],
          additionalProperties: false,
        },
      },
    },
    effect: "external",
    parallelSafe: false,
    async execute(rawArgs, context) {
      const args = parseArgs(rawArgs);
      const requestedUrl = readHttpUrl(readString(args.url, "url").trim());
      const targetPath = resolveUserPath(readString(args.path, "path"), context.cwd);
      const displayPath = toToolRelativePath(context.cwd, targetPath);
      const dispatch = beginExternalDispatch(context);
      if (!dispatch.shouldDispatch) {
        return dispatch.uncertain(new Error("The download was already dispatched; Kitty will not replay it."));
      }
      const request = createWebRequestController(context.abortSignal, "Web download timed out.");
      let responseComplete = false;
      try {
        const response = await fetchImpl(requestedUrl, {
          method: "GET",
          headers: { accept: "*/*", "user-agent": "Kitty web capability" },
          signal: request.signal,
        });
        const bytes = await readBoundedResponse(response, response.ok ? WEB_DOWNLOAD_MAX_BYTES : ERROR_RESPONSE_MAX_BYTES);
        responseComplete = true;
        const contentType = response.headers.get("content-type") ?? "application/octet-stream";
        if (!response.ok) {
          const detail = decodeResponseText(bytes, contentType).slice(0, 500);
          throw new KnownWebResponseError(`Web download returned HTTP ${response.status}${detail ? `: ${detail}` : "."}`);
        }
        const finalUrl = readHttpUrl(response.url || requestedUrl.toString()).toString();
        const existed = await fileExists(targetPath);
        await ensureParentDirectory(targetPath);
        await atomicWriteFile(targetPath, bytes);
        await context.recordWorksetFile?.({ path: targetPath, toolName: "web_download", changed: true, reason: existed ? "download replaced file" : "download created file" });
        updateWebHealth(context.projectContext.stateRootDir, "ready");
        return dispatch.settle({
          ok: true,
          output: JSON.stringify({
            ok: true,
            operationId: dispatch.operationId,
            requestedUrl: requestedUrl.toString(),
            finalUrl,
            path: displayPath,
            existed,
            bytes: bytes.length,
            sha256: sha256Content(bytes),
            mimeType: contentType,
            changedPaths: [displayPath],
          }, null, 2),
          metadata: {
            changedPaths: [targetPath],
            artifacts: [{ kind: "file", path: targetPath, bytes: bytes.length, mimeType: contentType }],
          },
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
