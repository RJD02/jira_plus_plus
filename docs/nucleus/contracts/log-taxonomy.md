# Log Taxonomy Contract

## Purpose
Defines the structured log envelope emitted by agents and services so observability and compliance tooling can parse events consistently.

## Fields
| Field | Type | Constraints | Notes |
| --- | --- | --- | --- |
| `timestamp` | string | Required ISO 8601 with timezone | Use UTC; include milliseconds when available |
| `level` | string | Required; one of `FATAL`, `ERROR`, `WARN`, `INFO`, `DEBUG` | Must match Agent house rules |
| `agent` | string | Required; `<component>:<version>` | Example `harvester:v2` |
| `directive` | string | Required | Identifier of the executing directive or workflow |
| `spec_id` | string | Optional | Reference to governing spec document |
| `message` | string | Required, concise summary | Avoid multi-line content |
| `outcome` | string | Optional | Values such as `started`, `succeeded`, `failed`, `degraded` |
| `correlation_id` | string | Optional but recommended | Propagated across services for tracing |
| `details` | map<string,string> | Optional | Structured key-value pairs for diagnostics |

## Validation Rules
- Reject logs missing `timestamp`, `level`, `agent`, `directive`, or `message`.
- `level` values must be uppercase and from the approved set; requests to add new levels require ADR discussion.
- `details` keys must be lowercase snake case; values should stay under 256 characters to limit ingestion cost.

## Example (Narrative)
A worker handling the `sync.api_registry` directive emits an INFO log at 2024-06-01T15:24:08Z. The agent identifier is `worker:v3`, the spec reference points to `docs/specs/2024-05-20-api-reg-sync.md`, and the message states that 12 API specs were reconciled successfully. The log records outcome `succeeded`, correlation ID `7f3c1f`, and includes details for environment `staging` and duration `4200ms`.
