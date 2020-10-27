// @ts-check
import '../../../exported';

import { assert } from '@agoric/assert';

import { assertIssuerKeywords } from '../../contractSupport';
import { makeLendInvitation } from './lend';
import { makeBorrowInvitation } from './borrow';
import { liquidate } from './liquidate';
import { makeCloseLoanInvitation } from './close';
import { makeAddCollateralInvitation } from './addCollateral';

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

  // Rather than grabbing the terms each time we use them, let's set
  // some defaults and add them to a contract-wide config.
  const {
    mmr = 150, // Maintenance Margin Requirement
    priceOracle,
    autoswap,
  } = zcf.getTerms();
  assert(priceOracle, `priceOracle must be provided`);
  assert(autoswap, `an autoswap instance must be provided`);

  const config = harden({
    mmr,
    priceOracle,
    autoswap,
    makeBorrowInvitation,
    liquidate,
    makeCloseLoanInvitation,
    makeAddCollateralInvitation,
  });

  const creatorInvitation = makeLendInvitation(zcf, config);

  return { creatorInvitation };
};

harden(start);
export { start };
