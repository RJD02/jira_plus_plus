# Acceptance Criteria — UI Text Overflow Fixes

## AC-1: No horizontal overflow on long text content
**Given** any component rendering user-generated or AI-generated text
**When** the text exceeds the container width (200+ characters, long URLs, long names)
**Then** no horizontal scrollbar appears and text is either truncated with ellipsis or wrapped within the container

## AC-2: Display name truncation
**Given** a user display name longer than 30 characters
**When** rendered in ScrumQuickGlance cards, UserSummaryCard headers, or AISummaryPanel drawer
**Then** the name is truncated with ellipsis and does not push sibling elements off-screen

## AC-3: URL and ID handling
**Given** a raw URL (80-120+ chars) or Jira account ID (40+ chars) displayed in IssueInsightsOverlay or UserSummaryCard
**When** rendered in a fixed-width container
**Then** the URL/ID is wrapped (`break-all`) or truncated, not overflowing horizontally

## AC-4: No test regressions
**Given** the overflow fixes are purely CSS class additions
**When** running the full test suite
**Then** all existing unit tests (77) and E2E tests (6 scrum + 31 smoke) pass without modification
