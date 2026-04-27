@waste @regression
Feature: WASTE_MEDICALLY_UNLIKELY_UNITS - line units exceeding the MUE limit are adjusted

  # mue-limits.json: PROC-LAB-CBC limit = 4. Submitting units = 10 fires.

  Background:
    * call read('classpath:features/_common/reset.feature')
    * configure headers = headers

  Scenario: 10 units of PROC-LAB-CBC (limit 4) fires ADJUST
    Given url baseUrl + '/api/encounters'
    And request { memberId: 'MBR-00012', providerId: 'PRV-00001', serviceDate: '2026-05-20', diagnosisCodes: [ 'DX-CHECKUP' ] }
    When method post
    Then status 201
    * def encounterId = response.encounterId

    Given url baseUrl + '/api/claims'
    And request
      """
      {
        memberId: 'MBR-00012', providerId: 'PRV-00001', encounterId: '#(encounterId)',
        payerId: 'PAYER-A', serviceDate: '2026-05-20',
        lines: [ { procedureCode: 'PROC-LAB-CBC', units: 10, billedAmount: 300.0 } ]
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
    And match adj.paidAmount == 102
    And match adj.reasonCodes contains 'CO-97'

    Given url baseUrl + '/api/claims/' + claimId + '/alerts'
    When method get
    Then status 200
    And match response.items contains deep
      """
      {
        ruleCode: 'WASTE_MEDICALLY_UNLIKELY_UNITS',
        category: 'WASTE',
        severity: 'MEDIUM',
        recommendedAction: 'ADJUST',
        evidence: { procedureCode: 'PROC-LAB-CBC', units: 10, mueLimit: 4 }
      }
      """
