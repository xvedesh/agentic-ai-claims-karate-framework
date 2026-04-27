@pipeline @regression
Feature: Pipeline event log - SUBMITTED -> VALIDATED -> ADJUDICATED -> ALERT_RAISED, all sharing one TRN

  Background:
    * call read('classpath:features/_common/reset.feature')
    * configure headers = headers

  Scenario: a happy-path submission emits 3 lifecycle events with one correlationId
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
    * def trn = response.adjudication.trn

    Given url baseUrl + '/api/pipeline/events'
    When method get
    Then status 200
    * def events = response.items
    * def claimEvents = karate.filter(events, function(e){ return e.claimId == claimId })
    And match claimEvents[*].eventType == ['CLAIM_SUBMITTED', 'CLAIM_VALIDATED', 'CLAIM_ADJUDICATED']
    And match each claimEvents[*].correlationId == trn

  Scenario: a denied claim also emits ALERT_RAISED, sharing the same TRN
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
    * def trn = response.adjudication.trn

    Given url baseUrl + '/api/pipeline/events?claimId=' + claimId
    When method get
    Then status 200
    * def events = response.items
    And match events[*].eventType contains ['CLAIM_SUBMITTED', 'CLAIM_VALIDATED', 'ALERT_RAISED', 'CLAIM_ADJUDICATED']
    And match each events[*].correlationId == trn

    # Filter by event type
    Given url baseUrl + '/api/pipeline/events?claimId=' + claimId + '&eventType=ALERT_RAISED'
    When method get
    Then status 200
    And match response.items == '#[1]'
    And match response.items[0].metadata.ruleCode == 'FRAUD_DUPLICATE_CLAIM'
