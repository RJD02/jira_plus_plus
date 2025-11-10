# KV Semantics Contract

## Purpose
Describes the envelope for compare-and-set operations in the coordination key-value store, ensuring deterministic retries and auditability.

## Fields
| Field | Type | Constraints | Notes |
| --- | --- | --- | --- |
| `key` | string | Required; max 128 characters | Format `<namespace>/<directive>/<resource>` |
| `value` | string or JSON string | Required | Serialized state; keep under 8 KB when possible |
| `version` | number | Required; monotonically increasing | Clients must supply expected version for CAS |
| `last_writer` | string | Required | Typically `<agent>:<spec_id>` |
| `request_id` | string | Required | Deterministic identifier per attempt |
| `ttl_seconds` | number | Optional | Expiry for ephemeral coordination keys |
| `tags` | map<string,string> | Optional | Metadata such as environment, shard, or risk level |
| `created_at` | string | Required ISO 8601 | Assigned by KV service |
| `updated_at` | string | Required ISO 8601 | Reflects last mutation timestamp |

## Validation Rules
- CAS updates must include `key`, `value`, `version`, `last_writer`, and `request_id`; omission fails the operation.
- Reject keys violating namespace format or containing whitespace.
- `version` increments by one per successful mutation; mismatches trigger retries according to Agent house rules.
- `ttl_seconds` is required for ephemeral locks and must not exceed 86400 without security review.

## Example (Narrative)
During a harvest replay, the `harvester:v2` agent writes to the key `harvesters/sync/api_registry`. It submits request ID `api-reg-20240601-01`, expects version 17, and proposes a new value describing the last processed commit hash. The KV store records the writer as `harvester:v2:docs/specs/2024-05-20-api-reg-sync.md`, sets the updated timestamp to the current UTC second, and leaves the TTL empty because the checkpoint is durable.
