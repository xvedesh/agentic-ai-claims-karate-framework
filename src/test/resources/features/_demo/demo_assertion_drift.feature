@intentional-failure @demo-failure
Feature: Intentional-failure demo - feeds the Failure Analyzer agent (Phase 7+)

  # Excluded from the default Surefire profile (~@intentional-failure).
  # Run on demand:
  #   mvn test -Dkarate.options="--tags @demo-failure"
  #
  # Each scenario fails for a DIFFERENT reason so the failure-analyzer
  # tooling has multiple categories to classify.

  Background:
    * call read('classpath:features/_common/reset.feature')
    * configure headers = headers

  Scenario: assertion drift - the test still expects pre-rules-engine math
    # Submitting a duplicate-claim trigger now correctly DENIES the claim,
    # but this scenario was written before Phase 3 and still expects PAID.
    # The failure analyzer should classify this as ASSERTION_DRIFT.
    Given url baseUrl + '/api/claims'
    And request
      """
      {
        memberId: 'MBR-00010', providerId: 'PRV-00001', encounterId: 'ENC-00010',
        payerId: 'PAYER-A', serviceDate: '2026-03-01',
        lines: [ { procedureCode: 'PROC-OFFICE-VISIT-1', units: 1, billedAmount: 100.0 } ]
      }
      """
    When method post
    Then status 201
    * def claimId = response.claimId

    Given url baseUrl + '/api/claims/' + claimId + '/submit'
    When method post
    Then status 200
    # INTENTIONAL: real status is DENIED.
    And match response.adjudication.status == 'PAID'

  Scenario: stale baseline - dollar amount no longer matches the deterministic adjudication
    # Happy-path math is 100 -> 85 -> 68. This scenario asserts the OLD
    # baseline (70). The failure analyzer should classify this as
    # STALE_BASELINE (a numeric-only mismatch, otherwise green).
    Given url baseUrl + '/api/claims'
    And request
      """
      {
        memberId: 'MBR-00001', providerId: 'PRV-00001', encounterId: 'ENC-00001',
        payerId: 'PAYER-A', serviceDate: '2026-04-10',
        lines: [ { procedureCode: 'PROC-OFFICE-VISIT-1', units: 1, billedAmount: 100.0 } ]
      }
      """
    When method post
    Then status 201
    * def claimId = response.claimId

    Given url baseUrl + '/api/claims/' + claimId + '/submit'
    When method post
    Then status 200
    # INTENTIONAL: real paidAmount is 68.
    And match response.adjudication.paidAmount == 70
