@guardrail @regression
Feature: False-positive guardrails - legitimate claims must NOT generate alerts

  # Each scenario submits a claim that LOOKS like a rule trigger on the surface
  # but is actually clean per the rule's guardrail conditions. We assert
  # winningAction == APPROVE and an empty alert list.

  Background:
    * call read('classpath:features/_common/reset.feature')
    * configure headers = headers

  Scenario: same member/provider/DOS as a paid claim but a different procedure - no FRAUD_DUPLICATE_CLAIM
    Given url baseUrl + '/api/claims'
    And request
      """
      {
        memberId: 'MBR-00010', providerId: 'PRV-00001', encounterId: 'ENC-00010',
        payerId: 'PAYER-A', serviceDate: '2026-03-01',
        lines: [ { procedureCode: 'PROC-LAB-CBC', units: 1, billedAmount: 30.0 } ]
      }
      """
    When method post
    Then status 201
    * def claimId = response.claimId

    Given url baseUrl + '/api/claims/' + claimId + '/submit'
    When method post
    Then status 200
    And match response.adjudication.status == 'PAID'
    And match response.adjudication.winningAction == 'APPROVE'
    And match response.adjudication.alerts == []

  Scenario: tier-3 E/M visit with a supporting chronic Dx - no ABUSE_UPCODING
    Given url baseUrl + '/api/claims'
    And request
      """
      {
        memberId: 'MBR-00010', providerId: 'PRV-00001', encounterId: 'ENC-00013',
        payerId: 'PAYER-A', serviceDate: '2026-03-10',
        lines: [ { procedureCode: 'PROC-OFFICE-VISIT-3', units: 1, billedAmount: 200.0 } ]
      }
      """
    When method post
    Then status 201
    * def claimId = response.claimId

    Given url baseUrl + '/api/claims/' + claimId + '/submit'
    When method post
    Then status 200
    And match response.adjudication.winningAction == 'APPROVE'

    Given url baseUrl + '/api/claims/' + claimId + '/alerts'
    When method get
    Then status 200
    And match response.items == []

  Scenario: bundle parent code billed alone - no ABUSE_UNBUNDLING
    Given url baseUrl + '/api/encounters'
    And request { memberId: 'MBR-00011', providerId: 'PRV-00003', serviceDate: '2026-04-26', diagnosisCodes: [ 'DX-HYPERTENSION' ] }
    When method post
    Then status 201
    * def encounterId = response.encounterId

    Given url baseUrl + '/api/claims'
    And request
      """
      {
        memberId: 'MBR-00011', providerId: 'PRV-00003', encounterId: '#(encounterId)',
        payerId: 'PAYER-A', serviceDate: '2026-04-26',
        lines: [ { procedureCode: 'PROC-PROC-LAP-COMBO', units: 1, billedAmount: 900.0 } ]
      }
      """
    When method post
    Then status 201
    * def claimId = response.claimId

    Given url baseUrl + '/api/claims/' + claimId + '/submit'
    When method post
    Then status 200
    And match response.adjudication.winningAction == 'APPROVE'
    And match response.adjudication.alerts == []

  Scenario: routine LAB outside the 30-day window - no WASTE_DUPLICATE_SERVICE
    Given url baseUrl + '/api/encounters'
    And request { memberId: 'MBR-00012', providerId: 'PRV-00001', serviceDate: '2026-06-15', diagnosisCodes: [ 'DX-CHECKUP' ] }
    When method post
    Then status 201
    * def encounterId = response.encounterId

    Given url baseUrl + '/api/claims'
    And request
      """
      {
        memberId: 'MBR-00012', providerId: 'PRV-00001', encounterId: '#(encounterId)',
        payerId: 'PAYER-A', serviceDate: '2026-06-15',
        lines: [ { procedureCode: 'PROC-LAB-CBC', units: 1, billedAmount: 30.0 } ]
      }
      """
    When method post
    Then status 201
    * def claimId = response.claimId

    Given url baseUrl + '/api/claims/' + claimId + '/submit'
    When method post
    Then status 200
    And match response.adjudication.winningAction == 'APPROVE'
    And match response.adjudication.alerts == []

  Scenario: units exactly at the MUE limit - no WASTE_MEDICALLY_UNLIKELY_UNITS
    Given url baseUrl + '/api/encounters'
    And request { memberId: 'MBR-00012', providerId: 'PRV-00001', serviceDate: '2026-05-21', diagnosisCodes: [ 'DX-CHECKUP' ] }
    When method post
    Then status 201
    * def encounterId = response.encounterId

    Given url baseUrl + '/api/claims'
    And request
      """
      {
        memberId: 'MBR-00012', providerId: 'PRV-00001', encounterId: '#(encounterId)',
        payerId: 'PAYER-A', serviceDate: '2026-05-21',
        lines: [ { procedureCode: 'PROC-LAB-CBC', units: 4, billedAmount: 120.0 } ]
      }
      """
    When method post
    Then status 201
    * def claimId = response.claimId

    Given url baseUrl + '/api/claims/' + claimId + '/submit'
    When method post
    Then status 200
    And match response.adjudication.winningAction == 'APPROVE'
    And match response.adjudication.alerts == []

  Scenario: brain MRI with DX-HEADACHE-CHRONIC supporting - no WASTE_UNNECESSARY_PATTERN
    Given url baseUrl + '/api/claims'
    And request
      """
      {
        memberId: 'MBR-00012', providerId: 'PRV-00002', encounterId: 'ENC-00012',
        payerId: 'PAYER-A', serviceDate: '2026-05-15',
        lines: [ { procedureCode: 'PROC-IMG-MRI-BRAIN', units: 1, billedAmount: 500.0 } ]
      }
      """
    When method post
    Then status 201
    * def claimId = response.claimId

    Given url baseUrl + '/api/claims/' + claimId + '/submit'
    When method post
    Then status 200
    And match response.adjudication.winningAction == 'APPROVE'
    And match response.adjudication.alerts == []
