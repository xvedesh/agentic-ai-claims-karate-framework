@ignore
Feature: Reusable claim/encounter helpers

  # Each Scenario in this file is meant to be invoked via `call read(...) { op: '...', ... }`.
  # All operations use the shared headers from karate-config.js.

  Background:
    * configure headers = headers

  Scenario: createEncounter
    # args: { memberId, providerId, serviceDate, diagnosisCodes }
    Given url baseUrl + '/api/encounters'
    And request
      """
      {
        memberId: '#(memberId)',
        providerId: '#(providerId)',
        serviceDate: '#(serviceDate)',
        diagnosisCodes: '#(diagnosisCodes)'
      }
      """
    When method post
    Then status 201
    * def encounterId = response.encounterId

  Scenario: createClaim
    # args: { body }   (body is a fully-formed claim payload)
    Given url baseUrl + '/api/claims'
    And request body
    When method post
    Then status 201
    * def claimId = response.claimId
    * def claim = response

  Scenario: submitClaim
    # args: { claimId }
    Given url baseUrl + '/api/claims/' + claimId + '/submit'
    When method post
    Then status 200
    * def submission = response
    * def adjudication = response.adjudication
    * def claim = response.claim

  Scenario: getClaimAlerts
    # args: { claimId }
    Given url baseUrl + '/api/claims/' + claimId + '/alerts'
    When method get
    Then status 200
    * def alerts = response.items
    * def ruleCodes = $response.items[*].ruleCode
