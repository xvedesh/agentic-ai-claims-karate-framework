@ignore
Feature: One-time JWT login (called via karate.callSingle from karate-config.js)

  Scenario: login as the seed user
    Given url baseUrl + auth.endpoint
    And request { username: '#(auth.username)', password: '#(auth.password)' }
    When method post
    Then status 200
    And match response contains { tokenType: 'Bearer' }
    And def accessToken = response.accessToken
