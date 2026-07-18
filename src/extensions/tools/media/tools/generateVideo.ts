import { createMediaVideo, pollMediaVideo } from "../../../../media/generation.js";
import { okResult, parseArgs, readString } from "../../../../tools/core/shared.js";
import type { RegisteredTool } from "../../../../tools/core/types.js";
import { saveGeneratedMedia } from "../shared.js";

export const generateVideoTool: RegisteredTool = {
  definition: {
    type: "function",
    function: {
      name: "generate_video",
      description: "Create or poll an Agnes video task. First call operation=create, persist the returned video_id, then call operation=poll with that video_id until a local video file is returned.",
      parameters: {
        type: "object",
        properties: {
          operation: { type: "string", enum: ["create", "poll"] },
          prompt: { type: "string" },
          video_id: { type: "string" },
          image_url: { type: "string" },
          keyframe_urls: { type: "array", items: { type: "string" }, maxItems: 2 },
          width: { type: "number" },
          height: { type: "number" },
          num_frames: { type: "number" },
          frame_rate: { type: "number" },
          seed: { type: "number" },
          negative_prompt: { type: "string" },
          wait_seconds: { type: "number" },
          output_path: { type: "string" },
        },
        required: ["operation"],
        additionalProperties: false,
      },
    },
  },
  effect: "external",
  async execute(rawArgs, context) {
    const args = parseArgs(rawArgs);
    const operation = readString(args.operation, "operation");
    if (operation === "create") {
      const result = await createMediaVideo({
        config: context.config.media,
        stateRootDir: context.projectContext.stateRootDir,
        prompt: readString(args.prompt, "prompt"),
        image: optionalString(args.image_url),
        keyframes: optionalStringArray(args.keyframe_urls),
        width: optionalInteger(args.width),
        height: optionalInteger(args.height),
        numFrames: optionalInteger(args.num_frames),
        frameRate: optionalNumber(args.frame_rate),
        seed: optionalInteger(args.seed),
        negativePrompt: optionalString(args.negative_prompt),
        outputPath: optionalString(args.output_path),
        signal: context.abortSignal,
      });
      return okResult(JSON.stringify({ ok: true, ...result }));
    }
    if (operation !== "poll") throw new Error(`Unsupported video operation: ${operation}.`);
    const result = await pollMediaVideo({
      config: context.config.media,
      cwd: context.cwd,
      stateRootDir: context.projectContext.stateRootDir,
      videoId: readString(args.video_id, "video_id"),
      waitSeconds: optionalNumber(args.wait_seconds),
      outputPath: optionalString(args.output_path),
      signal: context.abortSignal,
      saveArtifact: ({ outputPath, bytes }) => saveGeneratedMedia({
        context,
        toolName: "generate_video",
        outputPath,
        bytes,
        kind: "video",
      }),
    });
    const metadata = result.path
      ? {
        changedPaths: [result.path],
        changeId: result.changeId,
        artifacts: [{ kind: "file" as const, path: result.path, bytes: result.bytes, mimeType: result.contentType }],
      }
      : undefined;
    return okResult(JSON.stringify({ ok: true, ...result }), metadata);
  },
};

function optionalString(value: unknown): string | undefined { return typeof value === "string" && value.trim() ? value.trim() : undefined; }
function optionalStringArray(value: unknown): string[] | undefined { return Array.isArray(value) ? value.map((item) => readString(item, "keyframe_urls[]")) : undefined; }
function optionalNumber(value: unknown): number | undefined { return typeof value === "number" && Number.isFinite(value) ? value : undefined; }
function optionalInteger(value: unknown): number | undefined { const number = optionalNumber(value); return number === undefined ? undefined : Math.trunc(number); }
