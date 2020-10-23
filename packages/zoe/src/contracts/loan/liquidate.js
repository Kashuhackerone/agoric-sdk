// @ts-check
import '../../../exported';

import { E } from '@agoric/eventual-send';

import { depositToSeat, withdrawFromSeat } from '../../contractSupport';

// Question: does the borrower get anything back on liquidation? Or is
// it only the lender?

// triggered by priceOracle. Also closes contract
/**
 * @param {ContractFacet} zcf
 * @param {ZCFSeat} lenderSeat
 * @param {ZCFSeat} collSeat
 * @param {any} autoswap
 */
export const makeLiquidate = async (zcf, lenderSeat, collSeat, autoswap) => {
  // For simplicity, we will sell all collateral.
  const liquidate = async () => {
    const loanBrand = zcf.getTerms().brands.Loan;
    const zoeService = zcf.getZoeService();

    const allCollateral = collSeat.getAmountAllocated('Collateral');

    // TODO: add some buffer in case the price changes?
    const expectedValue = await E(autoswap).getInputPrice(
      allCollateral,
      loanBrand,
    );

    const { Collateral: collateralPayment } = await withdrawFromSeat(
      zcf,
      collSeat,
      {
        Collateral: allCollateral,
      },
    );

    const proposal = harden({
      want: { Out: expectedValue },
      give: { In: allCollateral },
    });

    const payments = harden({ In: collateralPayment });

    const swapInvitation = E(autoswap).makeSwapInInvitation();
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

    lenderSeat.exit();
    collSeat.exit();
    zcf.shutdown('your loan had to be liquidated');
  };

  return liquidate;
};
