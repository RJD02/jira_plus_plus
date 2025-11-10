# Edge Types Contract

## Purpose
Standardizes relationships between graph entities so services can reason about lineage, ownership, and dependencies without custom mapping.

## Fields
| Field | Type | Constraints | Notes |
| --- | --- | --- | --- |
| `edge_id` | string | Required, unique per source and target pair | Format `edge:<edge_type>:<source_id>-><target_id>` |
| `edge_type` | string | Required, drawn from registered taxonomy | Examples: `owns`, `depends_on`, `documents`, `publishes` |
| `source_id` | string | Required, must reference an existing entity | Must align with normalized item `item_id` |
| `target_id` | string | Required, must reference an existing entity | Same constraints as `source_id` |
| `direction` | string | Required, values `forward` or `bidirectional` | Determines traversal semantics |
| `confidence` | number | Optional, between 0 and 1 | Indicates inference strength when derived automatically |
| `metadata` | map<string,string> | Optional | Additional qualifiers such as environment or revision |
| `spec_ref` | string | Optional | ADR or spec governing this edge definition |

## Validation Rules
- Reject edges when either endpoint is unknown or soft deleted.
- Enforce taxonomy: new edge types require ADR approval and documentation updates.
- `confidence` defaults to 1 for authoritative sources; inferred edges below 0.6 trigger review queues.

## Example (Narrative)
The metadata graph records that the `service:catalog` entity depends on the `database:inventory` entity. The edge is issued as `edge:depends_on:service:catalog->database:inventory`, marked `forward`, and references ADR 0002 to document why the dependency exists. Because the relationship is discovered from configuration files, it carries confidence 0.9 and stores the deployment environment `prod` in metadata.
