@negative @regression
Feature: Contract violations - the API rejects malformed and unauthorized requests with the documented error envelope

  Background:
    * call read('classpath:features/_common/reset.feature')
    * configure headers = headers

  Scenario: protected endpoint requires Authorization header
    # Override headers locally with NO Authorization.
    * configure headers = { Accept: 'application/json' }
    Given url baseUrl + '/api/members'
    When method get
    Then status 401
    And match response.error.code == 'UNAUTHORIZED'

  Scenario: bearer token of the wrong shape is rejected
    * configure headers = { Authorization: 'Bearer not-a-real-jwt' }
    Given url baseUrl + '/api/claims'
    When method get
    Then status 401
    And match response.error.code == 'UNAUTHORIZED'

  Scenario: GET unknown claim id returns 404 with the documented envelope
    Given url baseUrl + '/api/claims/CLM-99999'
    When method get
    Then status 404
    And match response.error.code == 'NOT_FOUND'
    And match response.error.message contains 'Claim'

  Scenario: POST claim with unknown procedure code returns 400 INVALID_REQUEST/UNKNOWN_PROCEDURE
    Given url baseUrl + '/api/claims'
    And request
      """
      {
        memberId: 'MBR-00001', providerId: 'PRV-00001', encounterId: 'ENC-00001',
        payerId: 'PAYER-A', serviceDate: '2026-04-10',
        lines: [ { procedureCode: 'PROC-DOES-NOT-EXIST', units: 1, billedAmount: 100.0 } ]
      }
      """
    When method post
    Then status 400
    And match response.error.code == 'UNKNOWN_PROCEDURE'

  Scenario: POST claim with malformed serviceDate returns 400
    Given url baseUrl + '/api/claims'
    And request
      """
      {
        memberId: 'MBR-00001', providerId: 'PRV-00001', encounterId: 'ENC-00001',
        payerId: 'PAYER-A', serviceDate: '04/10/2026',
        lines: [ { procedureCode: 'PROC-OFFICE-VISIT-1', units: 1, billedAmount: 100.0 } ]
      }
      """
    When method post
    Then status 400
    And match response.error.code == 'INVALID_REQUEST'
    And match response.error.details.field == 'serviceDate'

  Scenario: re-submitting an already-adjudicated claim returns 409
    # First submit succeeds.
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
    * def adjId = response.adjudication.adjudicationId

    # Second submit -> 409 with the original adjudicationId echoed back.
    Given url baseUrl + '/api/claims/' + claimId + '/submit'
    When method post
    Then status 409
    And match response.error.code == 'CLAIM_ALREADY_SUBMITTED'
    And match response.error.details.adjudicationId == adjId
