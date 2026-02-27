# Plan — UI Text Overflow / Container Breaking Fixes

## Execution Order

### Phase 1: Critical layout-breaking fixes (4 changes)

**P1.1 — ScrumQuickGlance.tsx: display name truncation**
- Line 92: Change `max-w-[80px]` → `max-w-[120px]`, remove `capitalize`
- Already has `truncate` — just needs wider constraint

**P1.2 — UserSummaryCard.tsx: card header overflow**
- Line 123 (`<div className="space-y-1">`): Add `min-w-0` to enable flex shrinking
- Line 125 (`<h3>`): Add `truncate`
- Line 132 (email): Add `truncate`
- Line 134 (jiraAccountId): Add `truncate`
- Line 138 (project name): Add `truncate`
- Line 242 (issue summary): Add `break-words`

**P1.3 — IssueInsightsOverlay.tsx: header and URLs**
- Line 265 (h3 heading): Add `break-words` and `line-clamp-2`
- Lines 461, 734 (URL links): Add `break-all truncate` or wrap in a constrained container

**P1.4 — AISummaryPanel.tsx: drawer header**
- Line 258 (displayName h3): Add `truncate`
- Line 675 (TaskCard headline parent div): Add `min-w-0`, headline `<p>`: Add `truncate`

### Phase 2: High-priority visual fixes (3 changes)

**P2.1 — IssueInsightsOverlay.tsx: sidebar**
- Line 182: Add `line-clamp-2` to issue summary in sidebar list

**P2.2 — ManagerSummaryView.tsx: blocker table**
- Line 451: Add `max-w-xs truncate` or `line-clamp-2` to issue summary span

**P2.3 — AISummaryPanel.tsx: TaskCard bullets**
- Line 700 (activityBullets): Add `line-clamp-2 break-words`
- Line 708 (participants): Add `truncate`

### Phase 3: Medium-priority cosmetic fixes (5 changes)

**P3.1 — UserSummaryCard.tsx: DetailList**
- Line 400 (secondary): Add `line-clamp-3 break-words`

**P3.2 — IssueInsightsOverlay.tsx: linked issues**
- Line 700: Add `truncate` to related issue summary

**P3.3 — AISummaryPanel.tsx: narrative chips**
- Line 161 (li): Add `max-w-[280px] truncate`

**P3.4 — FocusIssueList.tsx: issue summary**
- Line 151: Add `break-words` to the `<p>` element

**P3.5 — AdminConsole.tsx: table truncation**
- Line 1180-1189: Move `truncate` from `<td>` to inner `<a>` element, or wrap `<a>` in a `<span className="truncate block">`

## Acceptance Criteria
- AC-1: No horizontal scrollbar appears when any text field contains 200+ character content
- AC-2: Display names longer than 30 characters are truncated with ellipsis in card headers and quick glance
- AC-3: Raw URLs in issue insights are wrapped or truncated, not overflowing
- AC-4: All existing E2E and unit tests continue to pass

## Verification
- Visual inspection with artificially long mock data in Playwright tests
- Existing E2E suite passes (6 scrum tests + 31 smoke tests)
- Existing unit tests pass (77 API tests)
