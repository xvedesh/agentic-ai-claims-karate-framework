@ignore
Feature: Admin reset (call this in Background to isolate scenarios)

  Scenario: reset the in-memory store
    Given url baseUrl + '/api/admin/reset'
    And configure headers = headers
    When method post
    Then status 200
    And match response == { status: 'RESET_OK' }
