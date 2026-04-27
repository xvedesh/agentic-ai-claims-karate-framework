@fraud @regression
Feature: FRAUD_DUPLICATE_CLAIM - exact rebill of a prior PAID claim is denied

  # Seeded fixture CLM-00050 (PAID) is a $100 PROC-OFFICE-VISIT-1 for
  # MBR-00010 + PRV-00001 + ENC-00010 on 2026-03-01. Re-billing the exact
  # same line on the same date triggers the rule.

  Background:
    * call read('classpath:features/_common/reset.feature')
    * configure headers = headers

  Scenario: rebilling a paid claim with same member/provider/DOS/procedure/amount fires DENY
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
    * def adjudication = response.adjudication
    And match adjudication.status == 'DENIED'
    And match adjudication.winningAction == 'DENY'
    And match adjudication.paidAmount == 0
    And match adjudication.reasonCodes contains 'CO-29'

    # Verify the alert details (envelope + evidence)
    Given url baseUrl + '/api/claims/' + claimId + '/alerts'
    When method get
    Then status 200
    And match response.items == '#[1]'
    * def alert = response.items[0]
    And match alert.ruleCode == 'FRAUD_DUPLICATE_CLAIM'
    And match alert.category == 'FRAUD'
    And match alert.severity == 'CRITICAL'
    And match alert.recommendedAction == 'DENY'
    And match alert.memberId == 'MBR-00010'
    And match alert.providerId == 'PRV-00001'
    And match alert.evidence.duplicateOf == 'CLM-00050'
    And match alert.evidence.priorStatus == 'PAID'
    And match alert.evidence.procedureCode == 'PROC-OFFICE-VISIT-1'
    And match alert.evidence.billedAmount == 100
