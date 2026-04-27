@fraud @regression
Feature: FRAUD_PHANTOM_BILLING - claim without an encounter is denied

  Background:
    * call read('classpath:features/_common/reset.feature')
    * configure headers = headers

  Scenario: claim submitted with no encounterId fires DENY
    Given url baseUrl + '/api/claims'
    And request
      """
      {
        memberId: 'MBR-00010', providerId: 'PRV-00001',
        payerId: 'PAYER-A', serviceDate: '2026-04-15',
        lines: [ { procedureCode: 'PROC-OFFICE-VISIT-1', units: 1, billedAmount: 100.0 } ]
      }
      """
    When method post
    Then status 201
    * def claimId = response.claimId
    And match response.encounterId == '#notpresent'

    Given url baseUrl + '/api/claims/' + claimId + '/submit'
    When method post
    Then status 200
    * def adjudication = response.adjudication
    And match adjudication.status == 'DENIED'
    And match adjudication.winningAction == 'DENY'
    And match adjudication.paidAmount == 0

    Given url baseUrl + '/api/claims/' + claimId + '/alerts'
    When method get
    Then status 200
    And match response.items[*].ruleCode contains 'FRAUD_PHANTOM_BILLING'
    And match response.items contains deep
      """
      {
        ruleCode: 'FRAUD_PHANTOM_BILLING',
        category: 'FRAUD',
        severity: 'CRITICAL',
        recommendedAction: 'DENY',
        memberId: 'MBR-00010',
        providerId: 'PRV-00001',
        evidence: { encounterId: null }
      }
      """
