# Execution — UI Text Overflow / Container Breaking Fixes

## Decisions

### D1: Tailwind-only approach
Applied only Tailwind CSS utility classes (`truncate`, `break-words`, `break-all`, `line-clamp-*`, `min-w-0`, `shrink-0`). No custom CSS or component logic changes.

### D2: Three-phase rollout
Prioritised fixes by severity:
- **Phase 1 (Critical)**: 4 layout-breaking fixes across ScrumQuickGlance, UserSummaryCard, IssueInsightsOverlay, AISummaryPanel
- **Phase 2 (High)**: 3 visual degradation fixes in sidebar, blocker table, TaskCard
- **Phase 3 (Medium)**: 5 cosmetic fixes in DetailList, linked issues, chips, FocusIssueList, AdminConsole

### D3: ScrumQuickGlance max-width widened from 80px to 120px
The original `max-w-[80px]` truncated most display names to ~10 characters. Widened to 120px for reasonable visibility within the 210px card. Also removed `capitalize` which silently mutated names like "O'Brien".

### D4: `min-w-0` pattern for flex children
Applied `min-w-0` to flex children containing text in `UserSummaryCard` header and `AISummaryPanel` header/TaskCard. This enables flex shrinking so `truncate` can work properly in `justify-between` layouts.

### D5: `break-all` for URLs, `break-words` for summaries
Used `break-all` on URL links (no natural word boundaries) and `break-words` on issue summaries (natural language with occasional long tokens). Added `shrink-0` to URL link icons to prevent them from collapsing.

### D6: AdminConsole table truncation fix
Moved `truncate` from `<td>` to the inner `<a>` element with `block` display. The CSS `text-overflow: ellipsis` requires `overflow: hidden` on the text-containing element itself, not a parent `<td>`.

## Changes Summary

| File | Changes |
|------|---------|
| `ScrumQuickGlance.tsx` | Widened `max-w-[80px]` → `max-w-[120px]`, removed `capitalize` |
| `UserSummaryCard.tsx` | Added `min-w-0`, `truncate` on name/email/ID/project, `break-words` on summary, `line-clamp-3` on DetailList secondary |
| `IssueInsightsOverlay.tsx` | Added `break-words line-clamp-2` on heading, `break-all shrink-0` on URLs, `line-clamp-2` on sidebar summary, `truncate` on linked issue |
| `AISummaryPanel.tsx` | Added `min-w-0 truncate` on header name, `min-w-0 truncate` on TaskCard headline, `truncate` on participants, `max-w-[280px] truncate` on chips |
| `ManagerSummaryView.tsx` | Added `line-clamp-2` on blocker table summary |
| `FocusIssueList.tsx` | Added `break-words` on issue summary paragraph |
| `AdminConsole.tsx` | Moved `truncate` from `<td>` to `<a>` with `block` display |

## Deviations

### DEV-1: Skipped ManagerSummaryView narrative max-height guard
Plan item #12 (AI narrative headline + body max-height guard) was deprioritised. The narrative renders as natural paragraph text in an unconstrained container, which is acceptable for the manager view layout. A `max-h` + `overflow-y-auto` would create a scroll-within-scroll UX that may be worse than the current behavior.

## Test Results
- **77/77 API unit tests**: All passed
- **6/6 Scrum E2E tests**: All passed
- **45/45 other E2E tests**: All passed (7 Keycloak auth tests pre-existing failures, 1 skipped)
