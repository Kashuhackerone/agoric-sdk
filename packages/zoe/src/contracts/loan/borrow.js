// @ts-check

import '../../../exported';

import { assert, details } from '@agoric/assert';
import { E } from '@agoric/eventual-send';

import { assertProposalShape, trade, natSafeMath } from '../../contractSupport';

/** @type {MakeBorrowInvitation} */
export const makeBorrowInvitation = (zcf, config) => {
  const {
    priceOracle,
    mmr,
    liquidate,
    makeCloseLoanInvitation,
    makeAddCollateralInvitation,
    lenderSeat,
  } = config;
  /** @type {OfferHandler} */
  const borrow = async borrowerSeat => {
    assertProposalShape(borrowerSeat, {
      give: { Collateral: null },
      want: { Loan: null },
    });

    const collateralGiven = borrowerSeat.getAmountAllocated('Collateral');
    const loanBrand = zcf.getTerms().brands.Loan;
    const loanMath = zcf.getTerms().maths.Loan;
    const collMath = zcf.getTerms().maths.Collateral;
    const wantedLoan = borrowerSeat.getProposal().want.Loan;

    // The value of the collateral in the Loan brand
    const collateralPriceInLoanBrand = await E(priceOracle).getInputPrice(
      collateralGiven,
      loanBrand,
    );
    // AWAIT ///

    // formula: assert collateralValue*100 >= wantedLoan*mmr
    // TODO: assess for rounding errors

    const approxForMsg = loanMath.make(
      natSafeMath.floorDivide(natSafeMath.multiply(wantedLoan.value, mmr), 100),
    );
    assert(
      loanMath.isGTE(
        loanMath.make(
          natSafeMath.multiply(collateralPriceInLoanBrand.value, 100),
        ),
        loanMath.make(natSafeMath.multiply(wantedLoan.value, mmr)),
      ),
      details`The required margin is approximately ${approxForMsg} but collateral only had value of ${collateralPriceInLoanBrand}`,
    );

    // Assert that the collateralGiven has not changed after the AWAIT
    assert(
      collMath.isEqual(
        collateralGiven,
        borrowerSeat.getAmountAllocated('Collateral'),
      ),
      `The collateral allocated changed during the borrow step, which should not have been possible`,
    );

    const { zcfSeat: collateralSeat } = zcf.makeEmptySeatKit();

    // Transfer the wanted Loan amount to the collateralSeat
    trade(
      zcf,
      {
        seat: lenderSeat,
        gains: {},
      },
      { seat: collateralSeat, gains: { Loan: wantedLoan } },
    );

    // Transfer *all* collateral to the collateral seat. Transfer the
    // wanted Loan amount to the borrower.
    trade(
      zcf,
      {
        seat: collateralSeat,
        gains: { Collateral: collateralGiven },
      },
      { seat: borrowerSeat, gains: { Loan: wantedLoan } },
    );

    // We now exit the borrower seat so that the borrower gets their
    // loan. However, the borrower gets an object as their offerResult
    // that will let them continue to interact with the contract.
    borrowerSeat.exit();

    // The liquidationTriggerValue is when the value of the collateral
    // equals mmr percent of the wanted loan
    // Formula: liquidationTriggerValue = (wantedLoan * mmr) / 100
    const liquidationTriggerValue = loanMath.make(
      natSafeMath.floorDivide(natSafeMath.multiply(wantedLoan.value, mmr), 100),
    );
    const debt = wantedLoan;

    // TODO: calculate interest
    // QUESTION: how is interest (aka stability fee on Maker) calculated?
    // Maker calculates on every block?
    const getInterest = () => loanMath.getEmpty();
    const getDebt = () => loanMath.add(debt, getInterest());

    const configWithBorrower = { ...config, getDebt, collateralSeat };

    const liquidationPromise = E(priceOracle).priceWhenBelow(
      collateralGiven,
      liquidationTriggerValue,
    );

    liquidationPromise
      .then(({ quoteAmount }) => {
        const expectedValueOfCollateral = quoteAmount.value[0].price;
        return liquidate(zcf, configWithBorrower, expectedValueOfCollateral);
      })
      .catch(err => {
        console.error(
          `Could not schedule automatic liquidation at the liquidationTriggerValue ${liquidationTriggerValue} using this priceOracle ${priceOracle}`,
        );
        console.error(err);
        throw err;
      });

    // The borrower can set up their own margin calls by getting the
    // priceOracle from the terms and calling
    // `E(priceOracle).priceWhenBelow(collateralGiven, x)` where x is
    // the priceLimit at which they want a reminder to addCollateral.

    // TODO: Add ability to liquidate partially
    // TODO: Add ability to withdraw excess collateral
    // TODO: Add ability to repay partially
    return harden({
      makeCloseLoanInvitation: () =>
        makeCloseLoanInvitation(zcf, configWithBorrower),
      makeAddCollateralInvitation: () =>
        makeAddCollateralInvitation(zcf, configWithBorrower),
      getLiquidationPromise: () => liquidationPromise,
    });
  };

  const customBorrowProps = harden({
    maxLoan: lenderSeat.getAmountAllocated('Loan'),
  });

  return zcf.makeInvitation(borrow, 'borrow', customBorrowProps);
};
