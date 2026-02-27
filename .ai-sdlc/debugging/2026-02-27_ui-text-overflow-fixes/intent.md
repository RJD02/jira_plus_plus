# Intent — UI Text Overflow / Container Breaking Fixes

## What
Multiple frontend components render user-generated or AI-generated text (display names, issue summaries, narratives, URLs, email addresses) without proper overflow handling. Long content breaks card layouts, overflows fixed-width panels, and pushes sibling elements off-screen.

## Why
The Daily Scrum Board, AI Summary Panel, Issue Insights Overlay, and Manager Summary views all display variable-length content from Jira and AI models. Without truncation, `break-words`, or container constraints, these components degrade visually when encountering real-world data — long Jira issue summaries (up to 255 chars), long display names, raw URLs, and multi-paragraph AI narratives.

## Scope
- Fix text overflow issues across scrum, AI summary, issue insights, manager summary, and admin components
- Apply consistent truncation/overflow patterns (Tailwind `truncate`, `break-words`, `line-clamp`, `min-w-0`)
- No functional changes — purely visual/layout fixes

## Constraints
- Tailwind CSS 3 utility classes only (no custom CSS)
- Must not change component APIs or data flow
- Mobile-responsive — fixes must work at all breakpoints
- Dark mode compatible
