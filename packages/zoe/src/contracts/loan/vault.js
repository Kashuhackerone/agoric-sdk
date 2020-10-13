// @ts-check

import { assert } from '@agoric/assert';

// Eventually will be importable from '@agoric/zoe-contract-support'
import { assertIssuerKeywords } from '../../contractSupport';
import '../../../exported';
import { makeLendInvitation } from './lend';
import { makeBorrowInvitation } from './borrow';

/**
 * Add collateral of a particular brand and get a loan of another
 * brand. Collateral (margin) must be greater than the loan value, at
 * an amount set by terms of the contract. The loan does not have a
 * distinct end. Rather, if the value of the collateral changes such
 * that insufficient margin is provided, the collateral is liquidated.
 *
 * @type {ContractStartFn}
 */
const start = zcf => {
  assertIssuerKeywords(zcf, harden(['Collateral', 'Loan']));

  // By default, if the value of the Collateral in Loan tokens drops below 150
  // percent of the loan amount, liquidate. Margin calls are set up by
  // the borrower based on their own assessment of risk.

  const {
    mmr = 150, // Maintenance Margin Requirement
    priceOracle,
  } = zcf.getTerms();
  assert(priceOracle, `priceOracle must be provided`);

  const creatorInvitation = makeLendInvitation(
    zcf,
    makeBorrowInvitation,
    mmr,
    priceOracle,
  );

  return { creatorInvitation };
};

harden(start);
export { start };
