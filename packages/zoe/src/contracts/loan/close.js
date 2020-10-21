// @ts-check

import './types';

import { assert, details } from '@agoric/assert';

import { assertProposalShape, trade } from '../../contractSupport';

// The amount which must be repaid is just the amount loaned plus
// interest (aka stability fee)

// QUESTION: how is interest (aka stability fee on Maker) calculated?
// Maker calculates on every block?

/** @type {MakeCloseLoanInvitation} */
export const makeCloseLoanInvitation = (
  zcf,
  collSeat,
  lenderSeat,
  getBorrowedAmount,
  getInterest,
) => {
  // If you repay (amount borrowed + interest) you get all collateral
  // back

  // Also closes contract

  /** @type {OfferHandler} */
  const repayAndClose = repaySeat => {
    assertProposalShape(repaySeat, {
      give: { Loan: null },
      want: { Collateral: null },
    });

    const loanMath = zcf.getTerms().maths.Loan;
    const {
      Loan: loanBrand,
      Collateral: collateralBrand,
    } = zcf.getTerms().brands;

    const repaid = repaySeat.getAmountAllocated('Loan', loanBrand);
    const borrowedAmount = getBorrowedAmount();
    const interestAmount = getInterest();
    const required = loanMath.add(borrowedAmount, interestAmount);

    // You must pay off the entire remainder
    assert(
      loanMath.isGTE(repaid, required),
      details`Not enough Loan assets have been repaid.  ${required} is required, but only ${repaid} was repaid.`,
    );

    // Cannot use `swap` or `swapExact` helper because the collSeat
    // doesn't have a want.

    // Transfer the collateral to the repaySeat and remove the
    // required loan tokens.
    trade(
      zcf,
      {
        seat: repaySeat,
        gains: {
          Collateral: collSeat.getAmountAllocated(
            'Collateral',
            collateralBrand,
          ),
        },
      },
      {
        seat: collSeat,
        gains: { Loan: required },
      },
    );

    // Transfer the repaid loan tokens to the lender
    trade(
      zcf,
      {
        seat: lenderSeat,
        gains: { Loan: required },
      },
      {
        seat: collSeat,
        gains: {},
      },
    );

    repaySeat.exit();
    lenderSeat.exit();
    collSeat.exit();
    const closeMsg = 'your loan is closed, thank you for your business';
    zcf.shutdown(closeMsg);
    return closeMsg;
  };

  // Note: we can't put the required repayment in the
  // customProperties because it will change
  return zcf.makeInvitation(repayAndClose, 'repayAndClose');
};
