package com.claims.runner;

import com.intuit.karate.Results;
import com.intuit.karate.Runner;
import org.junit.jupiter.api.Test;

import static org.junit.jupiter.api.Assertions.assertEquals;

/**
 * Single JUnit5 + Karate runner for the Claims Analytics Sandbox.
 *
 * Why one runner:
 *   - Karate ships its own Gherkin DSL; mixing Cucumber would only collide.
 *   - Tag filtering is the source of truth for which scenarios run
 *     (set via -Dkarate.options).
 *   - Default profile (set in pom.xml) excludes @intentional-failure demos.
 *
 * Why .parallel(1) and NOT @Karate.Test:
 *   - Every scenario calls /api/admin/reset in its Background to keep
 *     cross-claim history isolated. Parallel scenarios would race that
 *     reset and corrupt each other's state.
 *   - The Runner.path(...).parallel(1) form also produces the
 *     target/karate-reports/karate-summary.html aggregate report and
 *     Cucumber-compatible JSON, which @Karate.Test does not.
 *
 * How to invoke:
 *   mvn test                                                   (default: ~@intentional-failure)
 *   mvn test -Dkarate.options="--tags @smoke"
 *   mvn test -Dkarate.options="--tags @demo-failure"           (intentional failures, on-demand)
 *   mvn test -Dkarate.options="--tags @fraud or @abuse or @waste"
 *   mvn test -Dkarate.options="--tags @db"
 *
 * Reports:
 *   target/karate-reports/karate-summary.html
 *   target/karate-reports/karate-summary-json.txt   (Cucumber-compatible JSON)
 *   target/karate-reports/features.<path>.html       (per-feature drilldown)
 */
public class ClaimsKarateRunner {

    @Test
    void allFeatures() {
        Results results = Runner.path("classpath:features")
                .outputCucumberJson(true)
                .parallel(1);
        assertEquals(0, results.getFailCount(), results.getErrorMessages());
    }
}
