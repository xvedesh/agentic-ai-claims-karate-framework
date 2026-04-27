@db @pipeline @regression
Feature: H2/JDBC assertion - mirror an API adjudication into a SQL table and assert via SELECT

  # Demonstrates Karate's Java interop for cross-store assertions:
  # if the Node service wrote to a real warehouse, this is how a Karate
  # scenario would assert that the row landed and looks right.

  Background:
    * call read('classpath:features/_common/reset.feature')
    * configure headers = headers
    * def H2 = Java.type('com.claims.db.H2ClaimMirror')
    * H2.reset()

  Scenario: API adjudication is mirrored into H2 and queryable by SQL
    # 1. Submit a known claim through the API.
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
    * def adj = response.adjudication
    * def claim = response.claim

    # 2. Mirror the API result into H2 (in real life this would be done by an ETL job).
    * def mirrored = H2.insert({ claimId: claimId, status: adj.status, winningAction: adj.winningAction, paidAmount: adj.paidAmount, memberId: claim.memberId })
    And match mirrored == 1

    # 3. Assert the row is queryable via JDBC.
    * def rows = H2.query("SELECT claim_id, status, winning_action, paid_amount, member_id FROM claim_mirror WHERE claim_id = '" + claimId + "'")
    And match rows == '#[1]'
    And match rows[0].status == 'PAID'
    And match rows[0].winning_action == 'APPROVE'
    And match rows[0].member_id == 'MBR-00001'
    # paid_amount comes back as a java.math.BigDecimal; compare via .toString() for portability.
    And match rows[0].paid_amount.toString() == '68.00'

    # 4. Aggregate query (same SQL shape works for KPI-style rollups).
    * def agg = H2.query("SELECT winning_action, COUNT(*) AS n FROM claim_mirror GROUP BY winning_action")
    And match agg contains deep [{ winning_action: 'APPROVE', n: 1 }]
