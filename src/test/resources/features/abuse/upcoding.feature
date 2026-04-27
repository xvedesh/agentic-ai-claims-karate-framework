@abuse @regression
Feature: ABUSE_UPCODING - high-complexity E/M without supporting diagnosis flags MANUAL_REVIEW

  # MBR-00010 + ENC-00010 has only DX-CHECKUP. Billing PROC-OFFICE-VISIT-3
  # (tier 3) against that encounter should fire ABUSE_UPCODING.

  Background:
    * call read('classpath:features/_common/reset.feature')
    * configure headers = headers

  Scenario: tier-3 E/M visit with DX-CHECKUP only -> MANUAL_REVIEW, status PAID
    Given url baseUrl + '/api/claims'
    And request
      """
      {
        memberId: 'MBR-00010', providerId: 'PRV-00001', encounterId: 'ENC-00010',
        payerId: 'PAYER-A', serviceDate: '2026-03-01',
        lines: [ { procedureCode: 'PROC-OFFICE-VISIT-3', units: 1, billedAmount: 200.0 } ]
      }
      """
    When method post
    Then status 201
    * def claimId = response.claimId

    Given url baseUrl + '/api/claims/' + claimId + '/submit'
    When method post
    Then status 200
    * def adj = response.adjudication
    # MANUAL_REVIEW: status stays PAID, payment math unchanged.
    And match adj.status == 'PAID'
    And match adj.winningAction == 'MANUAL_REVIEW'
    And match adj.paidAmount == 136
    And match adj.alerts == '#[1]'

    Given url baseUrl + '/api/claims/' + claimId + '/alerts'
    When method get
    Then status 200
    And match response.items contains deep
      """
      {
        ruleCode: 'ABUSE_UPCODING',
        category: 'ABUSE',
        severity: 'HIGH',
        recommendedAction: 'MANUAL_REVIEW',
        evidence: {
          procedureCode: 'PROC-OFFICE-VISIT-3',
          complexityTier: 3,
          encounterDiagnoses: [ 'DX-CHECKUP' ]
        }
      }
      """
