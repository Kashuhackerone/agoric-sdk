// ts-check

import '../../../exported';

import { E } from '@agoric/eventual-send';

/** @type {ScheduleLiquidation} */
export const scheduleLiquidation = (zcf, configWithBorrower) => {
  const {
    collateralSeat,
    priceOracle,
    liquidate,
    liquidationTriggerValue,
    liquidationPromiseKit,
  } = configWithBorrower;
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
      throw err;
    });
};
