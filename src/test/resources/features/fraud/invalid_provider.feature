@fraud @regression
Feature: FRAUD_INVALID_PROVIDER - inactive provider or specialty mismatch is denied

  Background:
    * call read('classpath:features/_common/reset.feature')
    * configure headers = headers

  Scenario: inactive provider (PRV-00099) cannot bill any claim
    # Need an encounter referencing the inactive provider; create one on the fly.
    Given url baseUrl + '/api/encounters'
    And request { memberId: 'MBR-00001', providerId: 'PRV-00099', serviceDate: '2026-04-20', diagnosisCodes: [ 'DX-CHECKUP' ] }
    When method post
    Then status 201
    * def encounterId = response.encounterId

    Given url baseUrl + '/api/claims'
    And request
      """
      {
        memberId: 'MBR-00001', providerId: 'PRV-00099', encounterId: '#(encounterId)',
        payerId: 'PAYER-A', serviceDate: '2026-04-20',
        lines: [ { procedureCode: 'PROC-OFFICE-VISIT-1', units: 1, billedAmount: 100.0 } ]
      }
      """
    When method post
    Then status 201
    * def claimId = response.claimId

    Given url baseUrl + '/api/claims/' + claimId + '/submit'
    When method post
    Then status 200
    And match response.adjudication.status == 'DENIED'
    And match response.adjudication.winningAction == 'DENY'
    And match response.adjudication.paidAmount == 0

    Given url baseUrl + '/api/claims/' + claimId + '/alerts'
    When method get
    Then status 200
    And match response.items contains deep
      """
      {
        ruleCode: 'FRAUD_INVALID_PROVIDER',
        category: 'FRAUD',
        severity: 'HIGH',
        recommendedAction: 'DENY',
        evidence: { providerId: 'PRV-00099', active: false }
      }
      """

  Scenario: GENERAL provider performing a brain MRI fires specialty-mismatch DENY
    Given url baseUrl + '/api/encounters'
    And request { memberId: 'MBR-00001', providerId: 'PRV-00001', serviceDate: '2026-04-22', diagnosisCodes: [ 'DX-HEADACHE-CHRONIC' ] }
    When method post
    Then status 201
    * def encounterId = response.encounterId

    Given url baseUrl + '/api/claims'
    And request
      """
      {
        memberId: 'MBR-00001', providerId: 'PRV-00001', encounterId: '#(encounterId)',
        payerId: 'PAYER-A', serviceDate: '2026-04-22',
        lines: [ { procedureCode: 'PROC-IMG-MRI-BRAIN', units: 1, billedAmount: 500.0 } ]
      }
      """
    When method post
    Then status 201
    * def claimId = response.claimId

    Given url baseUrl + '/api/claims/' + claimId + '/submit'
    When method post
    Then status 200
    And match response.adjudication.status == 'DENIED'
    And match response.adjudication.winningAction == 'DENY'

    Given url baseUrl + '/api/claims/' + claimId + '/alerts'
    When method get
    Then status 200
    And match response.items contains deep
      """
      {
        ruleCode: 'FRAUD_INVALID_PROVIDER',
        evidence: {
          providerSpecialty: 'GENERAL',
          procedureCode: 'PROC-IMG-MRI-BRAIN',
          allowedSpecialties: [ 'RADIOLOGY', 'NEUROLOGY' ]
        }
      }
      """
