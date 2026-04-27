@happy @smoke @regression
Feature: Happy-path claim lifecycle (DRAFT -> SUBMITTED -> VALIDATED -> PAID)

  # The MBR-00001 + PRV-00001 + ENC-00001 fixture is intentionally a clean
  # base case: no rule fires. Used both as the lifecycle smoke test and
  # as the implicit guardrail for FRAUD_PHANTOM_BILLING.

  Background:
    * call read('classpath:features/_common/reset.feature')
    * configure headers = headers

  Scenario: create, submit, adjudicate, no alerts, status PAID
    # 1. Create draft
    Given url baseUrl + '/api/claims'
    And request
      """
      {
        memberId: 'MBR-00001',
        providerId: 'PRV-00001',
        encounterId: 'ENC-00001',
        payerId: 'PAYER-A',
        serviceDate: '2026-04-10',
        lines: [ { procedureCode: 'PROC-OFFICE-VISIT-1', units: 1, billedAmount: 100.0, modifiers: [] } ]
      }
      """
    When method post
    Then status 201
    * def claimId = response.claimId
    * match response.status == 'DRAFT'

    # 2. Submit -> pipeline -> 835
    Given url baseUrl + '/api/claims/' + claimId + '/submit'
    When method post
    Then status 200
    * def adjudication = response.adjudication
    * def claim = response.claim
    And match adjudication.status == 'PAID'
    And match adjudication.winningAction == 'APPROVE'
    And match adjudication.alerts == []
    And match adjudication.billedAmount == 100
    And match adjudication.allowedAmount == 85
    And match adjudication.paidAmount == 68
    And match adjudication.patientResponsibility == 17
    And match adjudication.trn == '#regex TRN-\\d{5}'
    And match claim.status == 'PAID'
    And match claim.statusHistory[*].status contains ['DRAFT', 'SUBMITTED', 'VALIDATED', 'PAID']
    And match claim.correlationId == adjudication.trn

    # 3. Claim-scoped alerts endpoint returns empty list (not 404)
    Given url baseUrl + '/api/claims/' + claimId + '/alerts'
    When method get
    Then status 200
    And match response == { items: [] }

    # 4. Re-fetching adjudication returns the same record (idempotent read)
    Given url baseUrl + '/api/claims/' + claimId + '/adjudication'
    When method get
    Then status 200
    And match response.adjudicationId == adjudication.adjudicationId
