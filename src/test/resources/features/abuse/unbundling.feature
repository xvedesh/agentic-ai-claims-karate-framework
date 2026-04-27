@abuse @regression
Feature: ABUSE_UNBUNDLING - billing both bundle components without the parent code is adjusted

  # bundles.json: {parent: PROC-PROC-LAP-COMBO, components: [LAP-A, LAP-B]}.
  # PRV-00003 has SURGERY specialty so FRAUD_INVALID_PROVIDER does NOT also fire.

  Background:
    * call read('classpath:features/_common/reset.feature')
    * configure headers = headers

  Scenario: claim billing LAP-A and LAP-B (no parent) fires ADJUST
    Given url baseUrl + '/api/encounters'
    And request { memberId: 'MBR-00011', providerId: 'PRV-00003', serviceDate: '2026-04-25', diagnosisCodes: [ 'DX-HYPERTENSION' ] }
    When method post
    Then status 201
    * def encounterId = response.encounterId

    Given url baseUrl + '/api/claims'
    And request
      """
      {
        memberId: 'MBR-00011', providerId: 'PRV-00003', encounterId: '#(encounterId)',
        payerId: 'PAYER-A', serviceDate: '2026-04-25',
        lines: [
          { procedureCode: 'PROC-PROC-LAP-A', units: 1, billedAmount: 500.0 },
          { procedureCode: 'PROC-PROC-LAP-B', units: 1, billedAmount: 500.0 }
        ]
      }
      """
    When method post
    Then status 201
    * def claimId = response.claimId

    Given url baseUrl + '/api/claims/' + claimId + '/submit'
    When method post
    Then status 200
    * def adj = response.adjudication
    And match adj.status == 'ADJUSTED'
    And match adj.winningAction == 'ADJUST'
    And match adj.paidAmount == 340

    Given url baseUrl + '/api/claims/' + claimId + '/alerts'
    When method get
    Then status 200
    And match response.items contains deep
      """
      {
        ruleCode: 'ABUSE_UNBUNDLING',
        category: 'ABUSE',
        severity: 'MEDIUM',
        recommendedAction: 'ADJUST',
        evidence: {
          bundleParentCode: 'PROC-PROC-LAP-COMBO',
          componentsBilled: [ 'PROC-PROC-LAP-A', 'PROC-PROC-LAP-B' ]
        }
      }
      """
