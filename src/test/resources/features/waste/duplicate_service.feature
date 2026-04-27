@waste @regression
Feature: WASTE_DUPLICATE_SERVICE - routine LAB repeated for same member within 30 days fires MANUAL_REVIEW

  # Seeded fixture CLM-00053 (PAID PROC-LAB-CBC for MBR-00012 on 2026-04-05).
  # A second CBC for the same member on 2026-04-15 (10 days later) fires the rule.

  Background:
    * call read('classpath:features/_common/reset.feature')
    * configure headers = headers

  Scenario: repeat LAB CBC within 30 days -> MANUAL_REVIEW, status PAID, no payment change
    Given url baseUrl + '/api/encounters'
    And request { memberId: 'MBR-00012', providerId: 'PRV-00001', serviceDate: '2026-04-15', diagnosisCodes: [ 'DX-CHECKUP' ] }
    When method post
    Then status 201
    * def encounterId = response.encounterId

    Given url baseUrl + '/api/claims'
    And request
      """
      {
        memberId: 'MBR-00012', providerId: 'PRV-00001', encounterId: '#(encounterId)',
        payerId: 'PAYER-A', serviceDate: '2026-04-15',
        lines: [ { procedureCode: 'PROC-LAB-CBC', units: 1, billedAmount: 30.0 } ]
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
    And match adj.paidAmount == 20.4
    And match adj.alerts == '#[1]'

    Given url baseUrl + '/api/claims/' + claimId + '/alerts'
    When method get
    Then status 200
    And match response.items contains deep
      """
      {
        ruleCode: 'WASTE_DUPLICATE_SERVICE',
        category: 'WASTE',
        severity: 'LOW',
        recommendedAction: 'MANUAL_REVIEW',
        evidence: {
          procedureCode: 'PROC-LAB-CBC',
          procedureCategory: 'LAB',
          windowDays: 30,
          memberId: 'MBR-00012'
        }
      }
      """
    * def alert = response.items[0]
    And match alert.evidence.priorClaimIds contains 'CLM-00053'
