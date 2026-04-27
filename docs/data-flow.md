# Data Flow (Phase 0 skeleton)

> Status: skeleton. Owner: Healthcare Domain Analyst.

## Sandbox flow (simplified projection of the Cotiviti-style diagram)

```mermaid
flowchart LR
  M[Member<br/>(synthetic patient)] --> E[Encounter]
  P[Provider<br/>(synthetic NPI)] --> E
  E --> C[Draft Claim<br/>837-like JSON]
  C -->|POST /api/claims/{id}/submit| V[Pipeline]
  V --> S[Structural & referential<br/>validation]
  S --> R[Deterministic Rules Engine<br/>9 rules: fraud / abuse / waste]
  R --> A[Adjudication<br/>835-like JSON]
  R --> AL[Alerts]
  V --> EV[Event log<br/>GET /api/pipeline/events]
```

## Mapping to the original Cotiviti diagram

| Original layer | Sandbox representation |
|---|---|
| Patient / Provider / EMR | `POST /api/members`, `/api/providers`, `/api/encounters` |
| EDI 270/271/837/999/835 | Plain JSON DTOs labelled `*-like`. No real X12. |
| SFTP + EDI parser + structural validation | In-process validation in `POST /api/claims/{id}/submit` |
| Kafka + microservices + DB | In-memory store + in-memory event log |
| Rules engine | `server/rules/*.js` — 9 deterministic rule modules |
| Reconciliation 837 ↔ 835 | TRN-style correlation id on the adjudication response |
| AI-Augmented SDET overlay | Layer B (`tools/`) — never participates in adjudication |

## DTO shapes delivered in Phase 1

`Member`, `Provider`, `Encounter`, and the draft `Claim` are stable
(see [`openapi/claims-api.yaml`](./openapi/claims-api.yaml) for the
full contract). Quick summary:

```jsonc
// Member
{ "memberId": "MBR-00001", "firstName": "Synthetic", "lastName": "PatientOne",
  "dateOfBirth": "1980-01-15", "gender": "F", "payerId": "PAYER-A", "active": true }

// Provider
{ "providerId": "PRV-00001", "name": "Synthetic Clinic North", "npi": "0000000001",
  "specialty": "GENERAL", "active": true }

// Encounter
{ "encounterId": "ENC-00001", "memberId": "MBR-00001", "providerId": "PRV-00001",
  "serviceDate": "2026-04-10", "diagnosisCodes": ["DX-CHECKUP"], "notes": "..." }

// Claim (DRAFT - 837-like skeleton)
{ "claimId": "CLM-00101", "memberId": "MBR-00001", "providerId": "PRV-00001",
  "encounterId": "ENC-00001", "payerId": "PAYER-A", "serviceDate": "2026-04-10",
  "lines": [ { "procedureCode": "PROC-OFFICE-VISIT-1", "units": 1,
               "billedAmount": 75.00, "modifiers": [] } ],
  "status": "DRAFT", "statusHistory": [{ "status": "DRAFT", "at": "..." }],
  "createdAt": "..." }
```

`encounterId` is intentionally optional on the claim — a claim without
a matching encounter is the trigger for the Phase-3
`FRAUD_PHANTOM_BILLING` rule.

## Phase 2 — submission shapes (delivered)

### Submit request and response

```
POST /api/claims/{id}/submit
   (no body required; server reads the persisted draft)
```

Successful response (HTTP 200):

```jsonc
{
  "ack": {
    "ackId":   "ACK-00001",
    "claimId": "CLM-00101",
    "accepted": true,
    "status":   "ACCEPTED",
    "errors":   []
  },
  "claim": { /* full Claim with statusHistory updated */ },
  "adjudication": {
    "adjudicationId":        "ADJ-00001",
    "claimId":               "CLM-00101",
    "trn":                   "TRN-00001",
    "status":                "PAID",
    "billedAmount":          75.00,
    "allowedAmount":         63.75,
    "paidAmount":            51.00,
    "patientResponsibility": 12.75,
    "adjustments":           [{ "type": "CONTRACTUAL", "amount": 11.25, "reasonCode": "CO-45" }],
    "reasonCodes":           ["CO-45"],
    "alerts":                [],
    "adjudicatedAt":         "..."
  },
  "events": ["EVT-00001", "EVT-00002", "EVT-00003"]
}
```

Rejection by the validator (HTTP 422):

```jsonc
{
  "error": {
    "code":    "CLAIM_REJECTED",
    "message": "Claim failed structural validation; submission not accepted",
    "details": {
      "ack": {
        "ackId":   "ACK-00002",
        "claimId": "CLM-00102",
        "accepted": false,
        "status":   "REJECTED",
        "errors":   [{ "code": "UNKNOWN_PROCEDURE", "message": "...", "details": { "index": 0 } }]
      }
    }
  }
}
```

Idempotency conflict (HTTP 409):

```jsonc
{
  "error": {
    "code":    "CLAIM_ALREADY_SUBMITTED",
    "message": "Claim has already been submitted",
    "details": { "claimId": "CLM-00101", "currentStatus": "PAID", "adjudicationId": "ADJ-00001" }
  }
}
```

### Pipeline event log shape

```jsonc
{
  "eventId":       "EVT-00001",
  "eventType":     "CLAIM_SUBMITTED",
  "claimId":       "CLM-00101",
  "correlationId": "TRN-00001",
  "timestamp":     "2026-04-10T12:34:56.789Z",
  "metadata":      { "ackId": "ACK-00001", "payerId": "PAYER-A" }
}
```

Event types: `CLAIM_SUBMITTED`, `CLAIM_VALIDATED`, `CLAIM_ADJUDICATED`, and
`ALERT_RAISED` (one per persisted alert once the rules registry is populated
— delivered in Phase 3). Every event in a single submission shares the same
`correlationId` (TRN), so a Karate scenario can correlate them after the fact.

### Alert shape

```jsonc
{
  "alertId":           "ALT-00001",
  "claimId":           "CLM-00101",
  "memberId":          "MBR-00010",
  "providerId":        "PRV-00001",
  "ruleCode":          "FRAUD_DUPLICATE_CLAIM",
  "category":          "FRAUD",        // FRAUD | ABUSE | WASTE | SYSTEM
  "severity":          "CRITICAL",     // CRITICAL | HIGH | MEDIUM | LOW
  "explanation":       "Duplicate of CLM-00050: ...",
  "evidence":          { "duplicateOf": "CLM-00050", "...": "..." },
  "recommendedAction": "DENY",         // DENY | ADJUST | MANUAL_REVIEW | APPROVE
  "raisedAt":          "..."
}
```

## Phase 3 — How alerts affect adjudication

The pipeline collects every alert draft each rule emits, persists them, and
emits one `ALERT_RAISED` event per alert. The adjudicator then computes a
single `winningAction` across all alerts using this priority chain:

```
ACTION    DENY > ADJUST > MANUAL_REVIEW > APPROVE
SEVERITY  CRITICAL > HIGH > MEDIUM > LOW
CATEGORY  FRAUD > ABUSE > WASTE > SYSTEM
```

That `winningAction` drives the terminal claim status:

| Winning action | Claim status | paidAmount      | Reason code | Notes |
|---|---|---|---|---|
| `DENY`          | `DENIED`   | `0`             | `CO-29` | Critical/High fraud, invalid provider, phantom billing. |
| `ADJUST`        | `ADJUSTED` | halved          | `CO-97` | Frequency, unbundling, MUE units. |
| `MANUAL_REVIEW` | `PAID`     | unchanged       | (none)  | Upcoding, duplicate service, unnecessary pattern. |
| `APPROVE`       | `PAID`     | unchanged       | (none)  | No rule fired. |

The adjudication response includes both the alert id list and the
`winningAction` field, so a Karate scenario can assert disposition without
re-running the priority logic.

### `SYSTEM` / `INTERNAL_RULE_ERROR`

If any rule throws, the engine attaches a single SYSTEM-category alert with
`ruleCode = INTERNAL_RULE_ERROR`. It is intentionally **not** a fraud/abuse/
waste finding. Filter alerts by `category in (FRAUD, ABUSE, WASTE)` for FWA
metrics, and by `category == SYSTEM` for framework-health metrics.
