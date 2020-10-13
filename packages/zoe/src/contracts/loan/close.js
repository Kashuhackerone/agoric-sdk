// @ts-check
import { assert } from '@agoric/assert';
import { E } from '@agoric/eventual-send';

import { assertProposalShape, trade, natSafeMath } from '../../contractSupport';
 
 // If you repay (amount borrowed + interest) you get all collateral back
 const close = repaySeat => {
  assertProposalShape(repaySeat, {
    give: { Loan: null },
    want: { Collateral: null },
  });

  const repaid = repaySeat.getAmountAllocated('Loan');
  const required = loanMath.add(borrowedAmount, interestAmount);

  // You must pay off the entire remainder
  assert(
    loanMath.isGTE(repaid, required),
    details`Not enough Loan assets have been repaid.  ${required} is required, but only ${repaid} was repaid.`,
  );

  // Cannot use `swap` or `swapExact` helper because the lender doesn't have a want
  trade(
    zcf,
    {
      seat: repaySeat,
      gains: { Collateral: lenderSeat.getAmountAllocated('Collateral') },
    },
    {
      seat: lenderSeat,
      gains: { Loan: required },
    },
  );
  repaySeat.exit();
  lenderSeat.exit();
  zcf.shutdown('your loan is closed, thank you for your business');
};

// Note: we can't put the required repayment in the
// customProperties because it will change
const makeRepayLoanInvitation = () => zcf.makeInvitation(repay, 'repay');