# Business Rules (Phase 3)

> Status: catalog locked. Owners: Healthcare Domain Analyst + Rules Engine Agent.

## Rule envelope

Each rule module exports a small descriptor and a pure `evaluate(ctx)` function:

```js
module.exports = {
  code: 'FRAUD_DUPLICATE_CLAIM',
  category: 'FRAUD',         // FRAUD | ABUSE | WASTE
  severity: 'CRITICAL',      // CRITICAL | HIGH | MEDIUM | LOW
  description: 'Plain-English summary of what the rule detects.',
  evaluate(ctx) { /* return null or AlertDraft */ }
};
```

`ctx` (built by `pipeline/submit.js`) contains:

```js
{
  claim,        // the claim being adjudicated
  member,       // resolved member record
  provider,     // resolved provider record
  encounter,    // resolved encounter record (or null)
  allClaims,    // every claim currently in the store (for cross-claim rules)
  refData       // store.refData (procedures, bundles, mue, frequency windows)
}
```

The pipeline takes any returned `AlertDraft`, attaches `alertId`, `claimId`,
`memberId`, `providerId`, `raisedAt`, persists it, and emits an `ALERT_RAISED`
event. Persisted alert shape:

```jsonc
{
  "alertId":           "ALT-00001",
  "claimId":           "CLM-00101",
  "memberId":          "MBR-00001",
  "providerId":        "PRV-00001",
  "ruleCode":          "FRAUD_DUPLICATE_CLAIM",
  "category":          "FRAUD",
  "severity":          "CRITICAL",
  "explanation":       "Duplicate of CLM-00050: ...",
  "evidence":          { "duplicateOf": "CLM-00050", "...": "..." },
  "recommendedAction": "DENY",
  "raisedAt":          "..."
}
```

## Approved rule catalog (9 rules)

### Fraud

#### 1. `FRAUD_DUPLICATE_CLAIM` — CRITICAL — DENY

| Field | Value |
|---|---|
| **Trigger** | A non-DRAFT prior claim exists with the same `memberId`, `providerId`, `serviceDate`, AND a line with the same `procedureCode` and `billedAmount`, within 90 days. |
| **Real-world analog** | Duplicate-billing detection — provider rebills the same encounter. |
| **Evidence** | `duplicateOf`, `memberId`, `providerId`, `serviceDate`, `procedureCode`, `billedAmount`, `priorStatus`. |
| **Guardrail** | A claim with the same member/provider/DOS but a *different* `procedureCode` or `billedAmount` does not fire. |
| **Fixture** | Seeded `CLM-00050` (PAID). Re-billing the exact same line for `MBR-00010 + PRV-00001 + 2026-03-01 + PROC-OFFICE-VISIT-1 + $100` triggers the rule. |

#### 2. `FRAUD_PHANTOM_BILLING` — CRITICAL — DENY

| Field | Value |
|---|---|
| **Trigger** | Claim has no `encounterId`, OR `encounterId` references an encounter whose `memberId` / `providerId` / `serviceDate` does not match the claim header. |
| **Real-world analog** | Services not rendered — the chart does not back the bill. |
| **Evidence** | `claimId`, `encounterId`, mismatch flags `{memberMismatch, providerMismatch, dateMismatch}`. |
| **Guardrail** | Claim with a matching encounter does not fire. The Phase-1 validator already rejects unknown `encounterId`s, so the mismatch path only fires after store mutations (defensive). |
| **Fixture** | Submit a draft for `MBR-00010 / PRV-00001` without setting `encounterId`. |

#### 3. `FRAUD_INVALID_PROVIDER` — HIGH — DENY

| Field | Value |
|---|---|
| **Trigger** | `provider.active === false`, OR any line's procedure has an `allowedSpecialties` list that does not include the provider's `specialty`. |
| **Real-world analog** | NPI screening, sanction-list checks, specialty credentialing edits. |
| **Evidence** | `providerId`, `providerSpecialty`, `procedureCode`, `allowedSpecialties` (or `active: false`). |
| **Guardrail** | Active provider performing a procedure within their registered specialty does not fire. Procedures with no `allowedSpecialties` list are universal and never fire this rule alone. |
| **Fixture** | Use seeded `PRV-00099` (`active: false`). Or have `PRV-00001` (GENERAL) bill `PROC-IMG-MRI-BRAIN` (allowed: RADIOLOGY, NEUROLOGY). |

### Abuse

#### 4. `ABUSE_UPCODING` — HIGH — MANUAL_REVIEW

| Field | Value |
|---|---|
| **Trigger** | An `EM` procedure with `complexityTier >= 2` is billed and the encounter has none of the procedure's `supportingDiagnoses`. |
| **Real-world analog** | Coding a visit at 99214/99215 when documentation only supports 99213 or below. |
| **Evidence** | `procedureCode`, `complexityTier`, `encounterDiagnoses`, `supportingDiagnoses`. |
| **Guardrail** | Tier-1 visits never fire. Encounters with at least one supporting diagnosis (e.g. `DX-DIAB-T2`, `DX-HYPERTENSION`) do not fire. |
| **Fixture** | `MBR-00010 + ENC-00010` (encounter has only `DX-CHECKUP`) billing `PROC-OFFICE-VISIT-3`. Guardrail uses `ENC-00013` (`DX-DIAB-T2`). |

#### 5. `ABUSE_EXCESSIVE_FREQUENCY` — MEDIUM — ADJUST

| Field | Value |
|---|---|
| **Trigger** | The same `procedureCode` has been billed for the same `memberId` more than `maxOccurrences` times within `windowDays`, where `(windowDays, maxOccurrences)` come from `mue-limits.json._frequencyWindows`. The current submission counts as one occurrence. |
| **Real-world analog** | CMS frequency edits — too many of the same service in a short window. |
| **Evidence** | `procedureCode`, `memberId`, `windowDays`, `maxOccurrences`, `observedOccurrences`, `priorClaimIds`. |
| **Guardrail** | Procedures with no frequency window are skipped. Claims spaced beyond the window do not count. |
| **Fixture** | Seeded `CLM-00051` + `CLM-00052` for `MBR-00011` (two `PROC-OFFICE-VISIT-1` claims on 03-15 and 03-17). A third claim on 03-18 is the third within the 7-day window and triggers (limit = 2). |

#### 6. `ABUSE_UNBUNDLING` — MEDIUM — ADJUST

| Field | Value |
|---|---|
| **Trigger** | The claim has lines for two or more component procedures of the same bundle in `bundles.json`, AND the bundle's `parentCode` is not also billed. |
| **Real-world analog** | NCCI Procedure-to-Procedure (PTP) edits. |
| **Evidence** | `bundleParentCode`, `componentsBilled`, `rationale`. |
| **Guardrail** | A single line with the parent code does not fire. (Future Phase-4 work: `MOD-59` distinct-service exception.) |
| **Fixture** | Two-line claim with `PROC-PROC-LAP-A` + `PROC-PROC-LAP-B` (no parent). Guardrail: single line with `PROC-PROC-LAP-COMBO`. |

### Waste

#### 7. `WASTE_DUPLICATE_SERVICE` — LOW — MANUAL_REVIEW

| Field | Value |
|---|---|
| **Trigger** | A `LAB` or `IMG` procedure is billed for a member who has at least one prior non-DRAFT claim with the same `procedureCode` within 30 days. |
| **Real-world analog** | Low-value-care patterns — repeat routine labs/imaging without clinical justification. |
| **Evidence** | `procedureCode`, `procedureCategory`, `windowDays`, `priorClaimIds`, `memberId`. |
| **Guardrail** | EM and PROC categories never fire. Claims spaced beyond 30 days do not fire. |
| **Fixture** | Seeded `CLM-00053` (PAID `PROC-LAB-CBC` for `MBR-00012` on 04-05). A new `PROC-LAB-CBC` for `MBR-00012` on 04-15 fires. |

#### 8. `WASTE_MEDICALLY_UNLIKELY_UNITS` — MEDIUM — ADJUST

| Field | Value |
|---|---|
| **Trigger** | Any line's `units` exceeds the per-procedure MUE limit in `mue-limits.json.limits`. |
| **Real-world analog** | CMS Medically Unlikely Edits — hard cap on units per code per DOS. |
| **Evidence** | `procedureCode`, `units`, `mueLimit`. |
| **Guardrail** | Lines whose code has no MUE entry are skipped. Lines exactly at the limit do not fire (limit is inclusive). |
| **Fixture** | Submit a `PROC-LAB-CBC` line with `units = 10` (limit = 4). Guardrail: `units = 4`. |

#### 9. `WASTE_UNNECESSARY_PATTERN` — LOW — MANUAL_REVIEW

| Field | Value |
|---|---|
| **Trigger** | A high-cost non-EM procedure (`category` in `{IMG, PROC}` AND `complexityTier >= 3`) is billed and the encounter has none of the procedure's `supportingDiagnoses`. |
| **Real-world analog** | Medical-necessity edits — expensive imaging/surgery without supporting clinical context. |
| **Evidence** | `procedureCode`, `procedureCategory`, `complexityTier`, `encounterDiagnoses`, `supportingDiagnoses`. |
| **Guardrail** | EM/LAB categories, tier-1/2 procedures, and procedures without a `supportingDiagnoses` list are skipped. |
| **Fixture** | `MBR-00012 + ENC-00011` (`DX-CHECKUP`) billing `PROC-IMG-MRI-BRAIN` via `PRV-00002` (RADIOLOGY) fires. Guardrail: `ENC-00012` (`DX-HEADACHE-CHRONIC`). |

## Action priority model

Multiple rules can fire on a single claim. The adjudicator picks a single
terminal status using a deterministic three-key priority:

```
1. action priority    DENY > ADJUST > MANUAL_REVIEW > APPROVE
2. severity priority  CRITICAL > HIGH > MEDIUM > LOW
3. category priority  FRAUD > ABUSE > WASTE > SYSTEM
```

Implementation lives in `server/rules/rulesEngine.js#pickWinningAction`, and
the mapping to claim status is in `server/pipeline/adjudicator.js`:

| Winning action | Claim terminal status | Payment effect | Reason code added |
|---|---|---|---|
| `DENY`          | `DENIED`   | `paidAmount = 0`            | `CO-29` |
| `ADJUST`        | `ADJUSTED` | `paidAmount` halved          | `CO-97` |
| `MANUAL_REVIEW` | `PAID`     | unchanged (alert raised)    | (none)  |
| `APPROVE`       | `PAID`     | unchanged (no rule fired)   | (none)  |

`MANUAL_REVIEW` deliberately does not change payment. The alert is the
signal; in a real payer the queue would route the claim to a human reviewer.
The sandbox keeps payment deterministic so tests can assert exact dollar
amounts even when MANUAL_REVIEW alerts are present.

## Internal rule errors are NOT FWA findings

If a rule throws an unhandled exception, the engine isolates the failure as a
**framework-safety alert**, not a healthcare business alert:

```jsonc
{
  "ruleCode":          "INTERNAL_RULE_ERROR",
  "category":          "SYSTEM",
  "severity":          "HIGH",
  "recommendedAction": "MANUAL_REVIEW",
  "evidence":          { "failedRuleCode": "...", "errorMessage": "...", "errorName": "..." }
}
```

Why a separate category: counting fraud/abuse/waste in dashboards or tests
must not be polluted by buggy rule code. Filter by `category in (FRAUD,
ABUSE, WASTE)` to get true FWA, and by `category == SYSTEM` to monitor
framework health.

## Multi-rule co-firing examples

| Scenario | Rules that fire | Winning action | Terminal status |
|---|---|---|---|
| Re-bill of an already-PAID claim, same lab as 5 days ago | `FRAUD_DUPLICATE_CLAIM`, `WASTE_DUPLICATE_SERVICE` | DENY (CRITICAL fraud) | `DENIED` |
| Two LAP components on a claim, no encounter | `FRAUD_PHANTOM_BILLING`, `ABUSE_UNBUNDLING` | DENY | `DENIED` |
| Tier-3 office visit on a `DX-CHECKUP` encounter | `ABUSE_UPCODING` | MANUAL_REVIEW | `PAID` (with alert) |
| 10 units of `PROC-LAB-CBC` on `MBR-00012` 5 days after a CBC | `WASTE_MEDICALLY_UNLIKELY_UNITS`, `WASTE_DUPLICATE_SERVICE` | ADJUST | `ADJUSTED` |
