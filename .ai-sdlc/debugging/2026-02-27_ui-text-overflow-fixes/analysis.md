# Analysis — UI Text Overflow / Container Breaking

## Root Cause
Components render dynamic text without defensive CSS. The Tailwind utility classes `truncate`, `break-words`, `line-clamp-*`, and `min-w-0` are missing from elements that display:
- User display names (from Jira/Keycloak — variable length)
- Issue summaries (Jira allows up to 255 chars)
- AI-generated narratives and headlines (unbounded)
- Raw URLs (80-120+ chars, no word-break characters)
- Email addresses and Jira account IDs

## Affected Components (16 issues across 7 files)

### Critical (layout-breaking)
| # | File | Line | Issue |
|---|------|------|-------|
| 1 | `ScrumQuickGlance.tsx` | 92 | `max-w-[80px]` crushes display names — far too tight for 210px card |
| 2A | `UserSummaryCard.tsx` | 125 | `<h3>` displayName no truncation, pushes status badge off-screen |
| 8 | `IssueInsightsOverlay.tsx` | 265 | `text-2xl` heading with full 255-char summary, no `break-words` |
| 9 | `IssueInsightsOverlay.tsx` | 461, 734 | Raw URLs as link text with no `break-all` — horizontal overflow |

### High (visual degradation)
| # | File | Line | Issue |
|---|------|------|-------|
| 2B | `UserSummaryCard.tsx` | 132 | Email address not truncated |
| 2C | `UserSummaryCard.tsx` | 134 | Jira account ID (UUID) untruncated |
| 2D | `UserSummaryCard.tsx` | 138 | Project name untruncated |
| 3 | `UserSummaryCard.tsx` | 242 | Issue summary missing `break-words` |
| 5 | `AISummaryPanel.tsx` | 258 | displayName in fixed-width drawer, no truncation |
| 6A | `AISummaryPanel.tsx` | 675 | TaskCard headline pushes "View" button off-screen |
| 7 | `IssueInsightsOverlay.tsx` | 182 | Sidebar summary in fixed 280px column, no line-clamp |
| 11 | `ManagerSummaryView.tsx` | 451 | Blocker table issue summary, no width constraint |

### Medium (cosmetic)
| # | File | Line | Issue |
|---|------|------|-------|
| 4 | `UserSummaryCard.tsx` | 396 | DetailList comment body rendered in full |
| 6B | `AISummaryPanel.tsx` | 700 | `activityBullets.join(" · ")` unbounded |
| 6C | `AISummaryPanel.tsx` | 708 | Participant names joined without limit |
| 10 | `IssueInsightsOverlay.tsx` | 700 | Linked issue summary concatenated, no truncation |
| 13 | `AISummaryPanel.tsx` | 158 | Narrative chips with no max-width in drawer |
| 15 | `FocusIssueList.tsx` | 151 | Key + summary concatenated, no `break-words` |
| 16 | `AdminConsole.tsx` | 1180 | `truncate` on `<td>` doesn't cascade to child `<a>` |

## Fix Strategy
Apply Tailwind utility classes systematically:

1. **Flex containers with text**: Add `min-w-0` to flex children that contain text, enabling proper shrinking
2. **Single-line display names/headings**: Add `truncate` (overflow-hidden + text-overflow-ellipsis + whitespace-nowrap)
3. **Multi-line body text**: Add `break-words` to prevent horizontal overflow on long tokens
4. **URLs/IDs**: Add `break-all` for strings with no natural word boundaries
5. **Fixed-width panels**: Add `line-clamp-2` or `line-clamp-3` for summaries in constrained containers
6. **ScrumQuickGlance**: Widen `max-w-[80px]` to `max-w-[120px]` and remove `capitalize`
7. **Admin table**: Move `truncate` from `<td>` to inner `<a>` element
