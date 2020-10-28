// @ts-check
import '../../../exported';

import { E } from '@agoric/eventual-send';

import { depositToSeat, withdrawFromSeat } from '../../contractSupport';

/**
 * This function is triggered by the priceOracle when the value of the
 * collateral is below the mmr percentage. The function performs the
 * liquidation and then shuts down the contract. Note that if a
 * liquidation occurs, the borrower gets nothing and they can take no
 * further action.
 *
 * @type {Liquidate}
 */
export const liquidate = async (zcf, config, expectedValue) => {
  const { collateralSeat, autoswap, lenderSeat } = config;

  // For simplicity, we will sell all collateral.
  const zoeService = zcf.getZoeService();

  const allCollateral = collateralSeat.getAmountAllocated('Collateral');

  // TODO: add some buffer in case the price changes?
  const { Collateral: collateralPayment } = await withdrawFromSeat(
    zcf,
    collateralSeat,
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
  const autoswapUserSeat = E(zoeService).offer(
    swapInvitation,
    proposal,
    payments,
  );

  /**
   * @param {{ Out: Promise<Payment>; In: Promise<Payment>; }} payouts
   */
  const handlePayoutsAndShutdown = async payouts => {
    const { Out: loanPayout, In: collateralPayout } = payouts;
    const { Out: loanAmount, In: collateralAmount } = await E(
      autoswapUserSeat,
    ).getCurrentAllocation();
    // AWAIT ///
    const amounts = harden({
      Collateral: collateralAmount,
      Loan: loanAmount,
    });
    const payoutPayments = harden({
      Collateral: collateralPayout,
      Loan: loanPayout,
    });
    await depositToSeat(zcf, lenderSeat, amounts, payoutPayments);
    lenderSeat.exit();
    collateralSeat.exit();
    zcf.shutdown('your loan had to be liquidated');
  };

  return E(autoswapUserSeat)
    .getPayouts()
    .then(handlePayoutsAndShutdown);
};
