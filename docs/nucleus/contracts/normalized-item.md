# Normalized Item Contract

## Purpose
Defines the canonical representation for artifacts harvested from external systems before they are projected into the metadata graph.

## Fields
| Field | Type | Constraints | Notes |
| --- | --- | --- | --- |
| `item_id` | string | Required, globally unique, stable across replays | Derived from source identifiers and namespace hash |
| `source_system` | string | Required, lowercase slug from approved registry | Examples: `github`, `confluence`, `swaggerhub` |
| `entity_type` | string | Required, aligns with graph taxonomy | Values such as `service`, `document`, `api_spec` |
| `canonical_path` | string | Required, absolute path or URL | Must be resolvable back to the source system |
| `hash` | string | Required, lowercase hex digest | SHA256 of raw payload to detect change |
| `owners` | array of strings | Optional, at least one when available | Use email formats or team slugs |
| `timeline` | object | Optional | Contains `created_at`, `updated_at`, `deleted_at` timestamps in ISO 8601 |
| `labels` | map<string,string> | Optional | Free-form metadata with max key length 32 characters |
| `spec_ref` | string | Optional | Points to governing spec or contract version |

## Validation Rules
- Reject records missing `item_id`, `source_system`, `entity_type`, or `canonical_path`.
- Ensure `hash` changes whenever the raw payload changes; duplicates should trip idempotency guards.
- `owners` must use project directory naming; unknown entries escalate for enrichment.
- If `timeline.deleted_at` is populated, propagate soft delete markers downstream.

## Example (Narrative)
A GitHub repository harvester emits a normalized item describing the `nucleus/api` service. It assigns `item_id` `repo:nucleus/api`, records the `source_system` as `github`, sets the `entity_type` to `service`, and provides the canonical path `https://github.com/nucleus/api`. The harvester captures a SHA256 hash of the repository default branch manifest and lists the owning teams `platform-eng` and `docs`. It notes the repo was created on `2021-04-12`, last updated this morning, and links the governing spec `docs/specs/2024-05-12-harvester-inventory.md`.
