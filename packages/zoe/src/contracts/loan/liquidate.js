// @ts-check
import '../../../exported';

import { E } from '@agoric/eventual-send';

import { depositToSeat, withdrawFromSeat, trade } from '../../contractSupport';

// Question: does the borrower get anything back on liquidation? Or is
// it only the lender?

// triggered by priceOracle. Also closes contract
/**
 * @param {ContractFacet} zcf
 * @param {ZCFSeat} lenderSeat
 * @param {ZCFSeat} collSeat
 * @param priceOracle
 * @param autoswap
 * @param priceOracle
 * @param autoswap
 * @param {() => Amount} getBorrowedAmount
 * @param {() => Amount} getInterest
 */
export const makeLiquidate = async (
  zcf,
  lenderSeat,
  collSeat,
  priceOracle,
  autoswap,
  getBorrowedAmount,
  getInterest,
) => {
  const liquidate = async () => {
    const loanMath = zcf.getTerms().maths.Loan;
    const collateralBrand = zcf.getTerms().brands.Collateral;
    const zoeService = zcf.getZoeService();

    const borrowedAmount = getBorrowedAmount();
    const interestAmount = getInterest();
    const required = loanMath.add(borrowedAmount, interestAmount);

    // How much collateral do we have to sell to repay the required
    // amount?
    // TODO: add some buffer in case the price changes?
    const collateralToSell = await E(priceOracle).getPriceOut(
      required,
      collateralBrand,
    );

    const { Collateral: collateralPayment } = await withdrawFromSeat(
      zcf,
      collSeat,
      {
        Collateral: collateralToSell,
      },
    );

    const proposal = harden({
      want: { Out: required },
      give: { In: collateralToSell },
    });

    const payments = harden({ In: collateralPayment });

    const swapInvitation = E(autoswap).getSwapInvitation();
    const autoswapSeat = E(zoeService).offer(
      swapInvitation,
      proposal,
      payments,
    );

    const collateralPayout = await E(autoswapSeat).getPayout('In');
    const loanPayout = await E(autoswapSeat).getPayout('Out');

    const allocation = await E(autoswapSeat).getCurrentAllocation();

    const amounts = harden({ Collateral: allocation.Out, Loan: allocation.In });

    await depositToSeat(zcf, lenderSeat, amounts, {
      Collateral: collateralPayout,
      Loan: loanPayout,
    });

    // move anything left over on collSeat over to lenderSeat
    trade(
      zcf,
      { seat: collSeat, gains: {} },
      { seat: lenderSeat, gains: collSeat.getCurrentAllocation() },
    );

    lenderSeat.exit();
    collSeat.exit();
    zcf.shutdown('your loan had to be liquidated');
  };

  return liquidate;
};
