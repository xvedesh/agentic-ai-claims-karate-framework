@abuse @regression
Feature: ABUSE_EXCESSIVE_FREQUENCY - third visit in a 7-day window is adjusted

  # Seeded fixtures: CLM-00051 (2026-03-15) and CLM-00052 (2026-03-17) are
  # PAID PROC-OFFICE-VISIT-1 claims for MBR-00011. The frequency window is
  # 7 days, max=2. A third visit at 2026-03-18 is the 3rd within the window.

  Background:
    * call read('classpath:features/_common/reset.feature')
    * configure headers = headers

  Scenario: third PROC-OFFICE-VISIT-1 within 7 days fires ADJUST
    Given url baseUrl + '/api/encounters'
    And request { memberId: 'MBR-00011', providerId: 'PRV-00001', serviceDate: '2026-03-18', diagnosisCodes: [ 'DX-HYPERTENSION' ] }
    When method post
    Then status 201
    * def encounterId = response.encounterId

    Given url baseUrl + '/api/claims'
    And request
      """
      {
        memberId: 'MBR-00011', providerId: 'PRV-00001', encounterId: '#(encounterId)',
        payerId: 'PAYER-A', serviceDate: '2026-03-18',
        lines: [ { procedureCode: 'PROC-OFFICE-VISIT-1', units: 1, billedAmount: 100.0 } ]
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
    And match adj.paidAmount == 34
    And match adj.reasonCodes contains 'CO-97'

    Given url baseUrl + '/api/claims/' + claimId + '/alerts'
    When method get
    Then status 200
    And match response.items contains deep
      """
      {
        ruleCode: 'ABUSE_EXCESSIVE_FREQUENCY',
        category: 'ABUSE',
        severity: 'MEDIUM',
        recommendedAction: 'ADJUST',
        evidence: {
          procedureCode: 'PROC-OFFICE-VISIT-1',
          memberId: 'MBR-00011',
          windowDays: 7,
          maxOccurrences: 2,
          observedOccurrences: 3
        }
      }
      """
    * def freqAlert = response.items[0]
    And match freqAlert.evidence.priorClaimIds contains ['CLM-00051','CLM-00052']
