package com.claims.db;

import java.sql.Connection;
import java.sql.DriverManager;
import java.sql.PreparedStatement;
import java.sql.ResultSet;
import java.sql.SQLException;
import java.sql.Statement;
import java.util.ArrayList;
import java.util.LinkedHashMap;
import java.util.List;
import java.util.Map;

/**
 * Small JDBC helper for the {@code @db} Karate scenario.
 *
 * The Node service is in-memory only, so this class STANDS IN for a real
 * payer warehouse: it spins up an embedded H2 database, takes the
 * adjudication-summary records the API returned, mirrors them into a SQL
 * table, and runs SQL queries that the Karate scenario can assert on.
 *
 * The interview talking point is: "If our claims service wrote to Postgres,
 * the Karate suite would call into JDBC like this for cross-store
 * assertions." The plumbing (DriverManager + PreparedStatement + SELECT)
 * is identical to what a real downstream-DB assertion would look like.
 *
 * No connection pool, no schema migration, no ORM - one class so the demo
 * is readable end-to-end.
 */
public final class H2ClaimMirror {

  private static final String JDBC_URL =
      "jdbc:h2:mem:claim_mirror;DB_CLOSE_DELAY=-1;MODE=PostgreSQL";

  private H2ClaimMirror() {}

  /**
   * Reset (drop+recreate) the {@code claim_mirror} table.
   * Called from Karate Background to keep scenarios isolated.
   */
  public static void reset() {
    try (Connection c = DriverManager.getConnection(JDBC_URL);
         Statement s = c.createStatement()) {
      s.execute("DROP TABLE IF EXISTS claim_mirror");
      s.execute(
          "CREATE TABLE claim_mirror (" +
          "  claim_id        VARCHAR(20) PRIMARY KEY," +
          "  status          VARCHAR(16) NOT NULL," +
          "  winning_action  VARCHAR(16) NOT NULL," +
          "  paid_amount     DECIMAL(12,2) NOT NULL," +
          "  member_id       VARCHAR(20) NOT NULL" +
          ")");
    } catch (SQLException e) {
      throw new RuntimeException("H2 reset failed: " + e.getMessage(), e);
    }
  }

  /**
   * Insert one mirror row from a Karate-friendly Map. Values are read by
   * key so the feature can pass exactly the fields it cares about.
   */
  public static int insert(Map<String, Object> row) {
    try (Connection c = DriverManager.getConnection(JDBC_URL);
         PreparedStatement ps = c.prepareStatement(
             "INSERT INTO claim_mirror (claim_id, status, winning_action, paid_amount, member_id) " +
             "VALUES (?, ?, ?, ?, ?)")) {
      ps.setString(1, String.valueOf(row.get("claimId")));
      ps.setString(2, String.valueOf(row.get("status")));
      ps.setString(3, String.valueOf(row.get("winningAction")));
      ps.setBigDecimal(4, new java.math.BigDecimal(String.valueOf(row.get("paidAmount"))));
      ps.setString(5, String.valueOf(row.get("memberId")));
      return ps.executeUpdate();
    } catch (SQLException e) {
      throw new RuntimeException("H2 insert failed: " + e.getMessage(), e);
    }
  }

  /** Run an arbitrary SELECT and return rows as a list of maps (Karate-friendly). */
  public static List<Map<String, Object>> query(String sql) {
    List<Map<String, Object>> out = new ArrayList<>();
    try (Connection c = DriverManager.getConnection(JDBC_URL);
         Statement s = c.createStatement();
         ResultSet rs = s.executeQuery(sql)) {
      int cols = rs.getMetaData().getColumnCount();
      while (rs.next()) {
        Map<String, Object> row = new LinkedHashMap<>();
        for (int i = 1; i <= cols; i++) {
          row.put(rs.getMetaData().getColumnLabel(i).toLowerCase(), rs.getObject(i));
        }
        out.add(row);
      }
    } catch (SQLException e) {
      throw new RuntimeException("H2 query failed: " + e.getMessage(), e);
    }
    return out;
  }
}
