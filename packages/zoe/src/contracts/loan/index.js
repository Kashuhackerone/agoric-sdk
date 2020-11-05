// @ts-check
import '../../../exported';

import { assert } from '@agoric/assert';

import { E } from '@agoric/eventual-send';
import { assertIssuerKeywords } from '../../contractSupport';
import { makeLendInvitation } from './lend';

/**
 * Add collateral of a particular brand and get a loan of another
 * brand. Collateral (as known as margin) must be greater than the
 * loan value, at an amount set by the Maintenance Margin Requirement
 * (mmr) in the terms of the contract. The loan does not have a
 * distinct end time. Rather, if the value of the collateral changes
 * such that insufficient margin is provided, the collateral is
 * liquidated, and the loan is closed. At any time, the borrower can
 * add collateral or repay the loan with interest, closing the loan.
 * The borrower can set up their own margin calls by getting the
 * priceAuthority from the 'autoswapInstance` in the terms of this
 * contract and calling
 * `E(autoswapPriceAuthority).quoteWhenLT(allCollateral, x)` where x
 * is the value of the collateral in the Loan brand at which they want
 * a reminder to addCollateral.
 *
 * Note that all collateral must be of the same brand and all of the
 * loaned amount and interest must be of the same (separate) brand.
 *
 * Terms:
 *  * mmr (default = 150) - the Maintenance Margin Requirement, in
 *    percent. The default is 150, meaning that collateral should be
 *    worth at least 150% of the loan. If the value of the collateral
 *    drops below mmr, liquidation occurs.
 *  * priceAuthority - will be used for getting the current value of
 *    collateral and setting liquidation triggers.
 *  * autoswapInstance - The running contract instance for an Autoswap
 *    or Multipool Autoswap installation. The publicFacet of the
 *    instance is used for producing an invitation to sell the
 *    collateral on liquidation.
 *  * periodAsyncIterable - the asyncIterable used for notifications
 *    that a period has passed, on which compound interest will be
 *    calculated using the interestRate.
 *  * interestRate - the rate in basis points that will be multiplied
 *    with the debt on every period to compound interest.
 *
 * IssuerKeywordRecord:
 *  * Keyword: 'Collateral' - The issuer for the digital assets to be
 *    escrowed as collateral.
 *  * Keyword: 'Loan' - The issuer for the digital assets to be loaned
 *    out.
 *
 * @type {ContractStartFn}
 */
const start = async zcf => {
  assertIssuerKeywords(zcf, harden(['Collateral', 'Loan']));

  // Rather than grabbing the terms each time we use them, let's set
  // some defaults and add them to a contract-wide config.

  const {
    mmr = 150, // Maintenance Margin Requirement
    autoswapInstance,
    priceAuthority,
    periodAsyncIterable,
    interestRate,
  } = zcf.getTerms();

  // Enable a type check
  /** @type {LoanTerms} */
  const _ = {
    mmr,
    autoswapInstance,
    priceAuthority,
    periodAsyncIterable,
    interestRate,
  };

  assert(autoswapInstance, `autoswapInstance must be provided`);
  assert(priceAuthority, `priceAuthority must be provided`);
  assert(periodAsyncIterable, `periodAsyncIterable must be provided`);
  assert(interestRate, `interestRate must be provided`);

  const zoeService = zcf.getZoeService();
  const autoswapPublicFacet = await E(zoeService).getPublicFacet(
    autoswapInstance,
  );
  // AWAIT ///

  /** @type {LoanConfig} */
  const config = {
    mmr,
    autoswapPublicFacet,
    priceAuthority,
    periodAsyncIterable,
    interestRate,
  };

  const creatorInvitation = makeLendInvitation(zcf, harden(config));

  return { creatorInvitation };
};

harden(start);
export { start };
