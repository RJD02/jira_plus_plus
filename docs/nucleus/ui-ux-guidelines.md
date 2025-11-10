# Nucleus UI/UX Interaction Spec

This spec captures the default interaction patterns we apply across Nucleus surfaces (metadata workspace, designer, reporting consoles). It complements `Agent.md` by spelling out when to use full pages versus modals/drawers and how to keep every surface agent-ready.

## 1. Route vs. Overlay Decision Tree

| Question | Yes → | No → |
| --- | --- | --- |
| Does the state need a URL/deep link/history? | **Page** (new route) | continue |
| Is the task ≤ 5 simple fields, low-risk, contextual? | **Dialog/Drawer** | continue |
| Does the user need to compare list + detail simultaneously? | **Drawer / side panel** | continue |
| Is it multi-step, attachments, approvals, or critical CRUD? | **Page / wizard** | **Dialog** (confirm + undo) |

### Default mapping

| Flow | Desktop | Mobile |
| --- | --- | --- |
| List browse | Page with filters, selection opens right-hand drawer | Full page list |
| Detail read | Drawer (with “open full page”) | Full page |
| Create (simple) | Dialog | Bottom sheet |
| Create (complex) | `/new` page or wizard | `/new` page |
| Edit (quick) | Drawer/Dialog with optimistic save | Bottom sheet |
| Edit (complex) | `/edit` page with autosave | `/edit` page |
| Delete/Archive | Confirm dialog + undo toast | Same |

## 2. Pattern Definitions

### Pages
Use for primary CRUD, multi-section forms, anything that must be shareable/bookmarkable, or when you need full focus (e.g., endpoint registration with 10+ fields or agent review flow).

### Dialogs (center modals)
Short, focused tasks (confirm delete, rename, assign). Keep ≤5 inputs; trap focus; close on `Esc`.

### Drawers / Side Panels
Master-detail scenarios (catalog list + dataset detail). Let the list remain visible; provide “Pop out” link when deeper work is required.

### Bottom Sheets (mobile)
Use drawers anchored to the bottom for quick actions; avoid covering the entire screen unless the task is truly full-screen.

## 3. Agent-Ready Surfaces

Every major page must:
1. Expose context panes (schema, prompt briefs) so agents can reference the same data.
2. Highlight the “agent entry point” (e.g., launch brief button, editable prompt block).
3. Provide audit breadcrumbs (“Collected at…”, “Last run…”) for agent replay.
4. Support “copy brief” / “open in agent” inline actions.

## 4. CRUD Recommendations

### List Pages
- Keep filter state in URL (`?q=&labels=&selectedId=`) so refresh and sharing preserve context.
- Use selection to open a **right drawer** (desktop) or push a detail page (mobile).
- Bulk actions live in the sticky header; status toasts float near the top center (current pattern in designer).

### Detail Views
- Desktop: drawer with summary + “Open full page” CTA.
- Mobile: dedicated route.
- Include quick actions (Run, Preview, Scope) plus event log for agents.

### Create / Edit Forms
- Small forms (≤5 inputs): dialog/drawer with optimistic save + undo toast.
- Large forms: dedicated route with section headers, inline validation, autosave timestamp, and Review step before submission if destructive.

### Delete / Archive
- Confirm dialog with consequence text and optional reason field.
- After success, show toast with “Undo” (timeboxed).

## 5. UX Guardrails

1. **URL State**: prefer modal routes (`/dataset/123?drawer=preview`) over opaque modals.
2. **Accessibility**: focus trap, `Esc` closes, `Enter` submits. Set initial focus on first interactive control.
3. **Latency**: display inline progress (skeleton or spinner near action), not just global spinner.
4. **Validation**: validate on blur + submit; show summary banner for long forms.
5. **Undo > confirm**: for non-destructive edits (e.g., scope dataset) skip confirmation and offer Undo toast.
6. **Consistency**: same action yields same pattern everywhere (e.g., dataset preview drawer).

## 6. Desktop vs Mobile

| Pattern | Desktop | Mobile |
| --- | --- | --- |
| Master-detail | Left nav + right drawer | Stacked routes |
| Forms | Drawer (small) / Page (large) | Full page (dialog only for micro edits) |
| Quick actions | Inline buttons with icons | Bottom sheet |

## 7. Implementation Notes (React + Tailwind)

* Use React Router routes for list/detail/create pages.
* For drawers, use `Dialog`/`Sheet` components (shadcn/ui) with `portal` + `focusScope`.
* Manage modal state via URL params or global store so refresh doesn’t lose context.
* Forms should use `react-hook-form` + zod schemas; section them with `Accordion` or `Tabs`.
* Toasts: `useToast()` with success + Undo pattern.

## 8. Anti-Patterns to Avoid

- Huge forms inside modals without a route.
- Critical states that cannot be deep-linked.
- Blocking dialogs for long-running actions without progress details.
- Inconsistent validation timing.

---

**Next steps**: Each feature spec (metadata, designer, reporting) should reference this doc when proposing new flows. Deviations must be justified in the spec/ADR. Update this document whenever we introduce a new interaction pattern.  
