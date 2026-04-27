@waste @regression
Feature: WASTE_UNNECESSARY_PATTERN - high-cost imaging without supporting Dx fires MANUAL_REVIEW

  # ENC-00011 has only DX-CHECKUP. Billing PROC-IMG-MRI-BRAIN (tier 4)
  # against it via PRV-00002 (RADIOLOGY - so FRAUD_INVALID_PROVIDER does NOT
  # also fire) flags the claim for review.

  Background:
    * call read('classpath:features/_common/reset.feature')
    * configure headers = headers

  Scenario: brain MRI for DX-CHECKUP fires MANUAL_REVIEW, status PAID, no payment change
    Given url baseUrl + '/api/claims'
    And request
      """
      {
        memberId: 'MBR-00012', providerId: 'PRV-00002', encounterId: 'ENC-00011',
        payerId: 'PAYER-A', serviceDate: '2026-05-01',
        lines: [ { procedureCode: 'PROC-IMG-MRI-BRAIN', units: 1, billedAmount: 500.0 } ]
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
    And match adj.paidAmount == 340

    Given url baseUrl + '/api/claims/' + claimId + '/alerts'
    When method get
    Then status 200
    And match response.items contains deep
      """
      {
        ruleCode: 'WASTE_UNNECESSARY_PATTERN',
        category: 'WASTE',
        severity: 'LOW',
        recommendedAction: 'MANUAL_REVIEW',
        evidence: {
          procedureCode: 'PROC-IMG-MRI-BRAIN',
          procedureCategory: 'IMG',
          complexityTier: 4,
          encounterDiagnoses: [ 'DX-CHECKUP' ]
        }
      }
      """
