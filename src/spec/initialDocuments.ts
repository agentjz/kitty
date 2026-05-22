import { normalizeSpecMarkdown } from "./format.js";
import type { SpecDocumentName } from "./types.js";

export function createInitialSpecDocument(document: SpecDocumentName): string {
  switch (document) {
    case "requirements":
      return normalizeSpecMarkdown([
        "# Requirements",
        "",
        "## Goal",
        "",
        "## Accepted Facts",
        "",
        "## Success Criteria",
        "",
        "## Scope",
        "",
        "## Non-goals",
        "",
        "## Constraints",
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
        "## Boundaries",
        "",
        "## Data and State",
        "",
        "## Verification",
        "",
        "## Risks",
        "",
      ].join("\n"));
    case "tasks":
      return normalizeSpecMarkdown([
        "# Tasks",
        "",
        "## Plan",
        "",
        "- [ ] Confirm requirements with success criteria.",
        "- [ ] Confirm design with boundaries and risks.",
        "- [ ] Confirm implementation tasks with validation evidence.",
        "- [ ] Implement from confirmed tasks.",
        "- [ ] Validate against success criteria.",
        "",
        "## Validation Map",
        "",
        "| Task | Evidence | Status |",
        "| --- | --- | --- |",
        "",
        "## Implementation Evidence",
        "",
        "| Change | Diff / File Evidence | Test / Validation Evidence |",
        "| --- | --- | --- |",
        "",
      ].join("\n"));
    case "notes":
      return normalizeSpecMarkdown([
        "# Notes",
        "",
        "This document records factual interview notes, accepted decisions, review evidence, and unresolved questions.",
        "",
        "## User Wording",
        "",
        "## Confirmed Facts",
        "",
        "## Decisions",
        "",
        "## Assumptions",
        "",
        "## Review Evidence",
        "",
        "## Unresolved Questions",
        "",
      ].join("\n"));
  }
}
