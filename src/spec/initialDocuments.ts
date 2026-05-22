import { normalizeSpecMarkdown } from "./format.js";
import type { SpecDocumentName } from "./types.js";

export function createInitialSpecDocument(document: SpecDocumentName): string {
  switch (document) {
    case "requirements":
      return normalizeSpecMarkdown([
        "# Requirements",
        "",
        "## Accepted Facts",
        "",
        "## Scope",
        "",
        "## Success Criteria",
        "",
        "## Non-goals",
        "",
        "## Open Questions",
        "",
      ].join("\n"));
    case "design":
      return normalizeSpecMarkdown([
        "# Design",
        "",
        "## Current Facts",
        "",
        "## Architecture",
        "",
        "## Data and State",
        "",
        "## Risks",
        "",
      ].join("\n"));
    case "tasks":
      return normalizeSpecMarkdown([
        "# Tasks",
        "",
        "- [ ] Confirm requirements.",
        "- [ ] Confirm design.",
        "- [ ] Confirm implementation tasks.",
        "- [ ] Implement from confirmed tasks.",
        "- [ ] Validate against success criteria.",
        "",
      ].join("\n"));
    case "notes":
      return normalizeSpecMarkdown([
        "# Notes",
        "",
        "This document records factual interview notes, accepted decisions, review evidence, and unresolved questions.",
        "",
      ].join("\n"));
  }
}
