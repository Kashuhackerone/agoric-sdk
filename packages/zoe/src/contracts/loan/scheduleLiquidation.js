// ts-check

import '../../../exported';

import { E } from '@agoric/eventual-send';

import { natSafeMath } from '../../contractSupport';

/** @type {ScheduleLiquidation} */
export const scheduleLiquidation = (zcf, configWithBorrower) => {
  const {
    collateralSeat,
    lenderSeat,
    priceOracle,
    liquidate,
    liquidationPromiseKit,
    getDebt,
    mmr,
  } = configWithBorrower;

  const loanMath = zcf.getTerms().maths.Loan;

  const currentDebt = getDebt();

  // The liquidationTriggerValue is when the value of the collateral
  // equals mmr percent of the current debt
  // Formula: liquidationTriggerValue = (currentDebt * mmr) / 100
  const liquidationTriggerValue = loanMath.make(
    natSafeMath.floorDivide(natSafeMath.multiply(currentDebt.value, mmr), 100),
  );

  const collateralMath = zcf.getTerms().maths.Collateral;

  const allCollateral = collateralSeat.getAmountAllocated('Collateral');

  const internalLiquidationPromise = E(priceOracle).priceWhenLT(
    allCollateral,
    liquidationTriggerValue,
  );

  internalLiquidationPromise
    .then(priceQuote => {
      const { quoteAmount } = priceQuote;
      const expectedValueOfCollateral = quoteAmount.value[0].price;
      const assetAmount = quoteAmount.value[0].assetAmount;
      // Only liquidate if this trigger is still pertinent.  Check
      // that the quote is for exactly the current amount of
      // collateral
      const currentCollateral = collateralSeat.getAmountAllocated('Collateral');
      if (collateralMath.isEqual(assetAmount, currentCollateral)) {
        liquidationPromiseKit.resolve(priceQuote);
        liquidate(zcf, configWithBorrower, expectedValueOfCollateral);
      }
    })
    .catch(err => {
      console.error(
        `Could not schedule automatic liquidation at the liquidationTriggerValue ${liquidationTriggerValue} using this priceOracle ${priceOracle}`,
      );
      console.error(err);
      // The borrower has exited at this point with their loan. The
      // collateral is on the collateral seat. If an error occurs, we
      // reallocate the collateral to the lender and shutdown the
      // contract, kicking out any remaining seats.
      zcf.reallocate(
        lenderSeat.stage({ Collateral: allCollateral }),
        lenderSeat.stage({}),
      );
      zcf.shutdownWithFailure(err);
      throw err;
    });
};
