'use strict';

/**
 * Synthetic 835-like adjudication.
 *
 * NOT a real X12 835. Numbers are deterministic synthetic values designed for
 * interview-readability and easy Karate assertions:
 *
 *   billedAmount         = sum of line.billedAmount
 *   allowedAmount        = round(billedAmount * 0.85, 2)   // 15% contractual writedown
 *   paidAmount           = round(allowedAmount * 0.80, 2)  // 80/20 plan split
 *   patientResponsibility= allowedAmount - paidAmount
 *   writedown            = billedAmount - allowedAmount    // CO-45 contractual adjustment
 *
 * Terminal status mapping (driven by `pickWinningAction`):
 *
 *   DENY          -> DENIED      paidAmount = 0;        CO-29 added
 *   ADJUST        -> ADJUSTED    paidAmount halved;     CO-97 added
 *   MANUAL_REVIEW -> PAID        no payment change;     alert(s) attached
 *   APPROVE       -> PAID        no rule fired
 *
 * `MANUAL_REVIEW` deliberately does NOT change payment. The alert is the
 * signal; in a real payer the queue would route the claim to a human
 * reviewer, but in this sandbox it pays at the standard rate so tests can
 * still assert specific dollar amounts.
 */

const store = require('../store');
const { pickWinningAction } = require('../rules/rulesEngine');
const { ACTIONS } = require('../rules/_shared');

function round2(n) {
  return Math.round(n * 100) / 100;
}

function totalBilled(claim) {
  return round2((claim.lines || []).reduce((sum, l) => sum + (l.billedAmount || 0), 0));
}

function buildAdjudication(claim, alertDrafts, trn) {
  const billed = totalBilled(claim);
  const allowed = round2(billed * 0.85);
  let paid = round2(allowed * 0.8);
  let patientResponsibility = round2(allowed - paid);
  const writedown = round2(billed - allowed);

  const adjustments = [];
  const reasonCodes = [];
  if (writedown > 0) {
    adjustments.push({
      type: 'CONTRACTUAL',
      amount: writedown,
      reasonCode: 'CO-45',
      explanation: 'Charge exceeds contracted/allowed amount.',
    });
    reasonCodes.push('CO-45');
  }

  const winningAction = pickWinningAction(alertDrafts);
  let status;
  if (winningAction === ACTIONS.DENY) {
    adjustments.push({
      type: 'DENIAL',
      amount: paid,
      reasonCode: 'CO-29',
      explanation: 'Denied per fraud/abuse rule. See alerts.',
    });
    reasonCodes.push('CO-29');
    paid = 0;
    patientResponsibility = 0;
    status = 'DENIED';
  } else if (winningAction === ACTIONS.ADJUST) {
    const adjustAmount = round2(paid * 0.5);
    adjustments.push({
      type: 'ADJUSTMENT',
      amount: adjustAmount,
      reasonCode: 'CO-97',
      explanation: 'Payment reduced per abuse/waste rule. See alerts.',
    });
    reasonCodes.push('CO-97');
    paid = round2(paid - adjustAmount);
    patientResponsibility = round2(allowed - paid);
    status = 'ADJUSTED';
  } else {
    // MANUAL_REVIEW or APPROVE - pay at standard rate; alerts (if any) attach.
    status = 'PAID';
  }

  return {
    adjudicationId: store.nextId('adjudication'),
    claimId: claim.claimId,
    trn,
    status,
    billedAmount: billed,
    allowedAmount: allowed,
    paidAmount: paid,
    patientResponsibility,
    adjustments,
    reasonCodes,
    alerts: [], // alert IDs filled in by the pipeline once alerts are persisted
    winningAction,
    adjudicatedAt: new Date().toISOString(),
  };
}

module.exports = { buildAdjudication };
