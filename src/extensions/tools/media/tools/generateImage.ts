import { generateMediaImage } from "../../../../media/generation.js";
import { okResult, parseArgs, readString } from "../../../../tools/core/shared.js";
import type { RegisteredTool } from "../../../../tools/core/types.js";
import { saveGeneratedMedia } from "../shared.js";

export const generateImageTool: RegisteredTool = {
  definition: {
    type: "function",
    function: {
      name: "generate_image",
      description: "Generate or edit an image with the configured media provider and save the result as a local project file.",
      parameters: {
        type: "object",
        properties: {
          prompt: { type: "string" },
          size: { type: "string", enum: ["1K", "2K", "3K", "4K"] },
          ratio: { type: "string", enum: ["1:1", "3:4", "4:3", "16:9", "9:16", "2:3", "3:2", "21:9"] },
          image_urls: { type: "array", items: { type: "string" }, maxItems: 8 },
          output_path: { type: "string" },
          response_format: { type: "string", enum: ["url", "b64_json"] },
        },
        required: ["prompt"],
        additionalProperties: false,
      },
    },
  },
  changeSignal: "required",
  effect: "external",
  async execute(rawArgs, context) {
    const args = parseArgs(rawArgs);
    const result = await generateMediaImage({
      config: context.config.media,
      cwd: context.cwd,
      prompt: readString(args.prompt, "prompt"),
      size: optionalString(args.size),
      ratio: optionalString(args.ratio),
      images: optionalStringArray(args.image_urls),
      outputPath: optionalString(args.output_path),
      responseFormat: optionalString(args.response_format) === "b64_json" ? "b64_json" : "url",
      signal: context.abortSignal,
      saveArtifact: ({ outputPath, bytes }) => saveGeneratedMedia({
        context,
        toolName: "generate_image",
        outputPath,
        bytes,
        kind: "image",
      }),
    });
    return okResult(JSON.stringify({ ok: true, ...result }), {
      changedPaths: [result.path],
      changeId: result.changeId,
      artifacts: [{ kind: "file", path: result.path, bytes: result.bytes, mimeType: result.contentType }],
    });
  },
};

function optionalString(value: unknown): string | undefined { return typeof value === "string" && value.trim() ? value.trim() : undefined; }
function optionalStringArray(value: unknown): string[] | undefined { return Array.isArray(value) ? value.map((item) => readString(item, "image_urls[]")) : undefined; }
