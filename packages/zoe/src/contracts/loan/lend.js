// @ts-check

import '../../../exported';

import { assertProposalShape } from '../../contractSupport';

// The lender puts up the tokens to be loaned to the borrower, but has
// no further actions. The loan is ongoing until it is paid back
// entirely or liquidated, at which point the lender receives a
// payout. This means that the payout for the lender will always only
// be in Loan-branded digital assets, not Collateral-brand.

/** @type {MakeLendInvitation} */
export const makeLendInvitation = (zcf, config) => {
  /** @type {OfferHandler} */
  const lend = lenderSeat => {
    // Lender will want the interest earned from the loan + their
    // refund or the results of the liquidation. If the price of
    // collateral drops before we get the chance to liquidate, the
    // total payout could be zero.

    // If the exit rule was `waived`, a borrower would be able to
    // hold on to their invitation and effectively lock up the
    // lender's Loan tokens forever. The lender must be able to exit
    // on demand. When the borrowing occurs, the collateral is moved
    // to a special collateral seat to prevent the lender from being
    // able to exit with collateral before the contract ends
    // (repayment or liquidation).
    assertProposalShape(lenderSeat, {
      want: {}, // No return can be guaranteed.
      give: { Loan: null },
      exit: { onDemand: null }, // The lender must be able to exit with their loan at any time before borrowing
    });

    const { makeBorrowInvitation } = config;
    const configWithLenderSeat = { ...config, lenderSeat };
    return makeBorrowInvitation(zcf, configWithLenderSeat);
  };

  return zcf.makeInvitation(lend, 'lend');
};
