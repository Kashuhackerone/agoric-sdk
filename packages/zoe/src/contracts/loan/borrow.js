// @ts-check

import '../../../exported';

import { assert, details } from '@agoric/assert';
import { E } from '@agoric/eventual-send';
import { makePromiseKit } from '@agoric/promise-kit';

import { assertProposalShape, trade, natSafeMath } from '../../contractSupport';

import { scheduleLiquidation } from './scheduleLiquidation';
import { calculateInterest, makeDebtCalculator } from './updateDebt';

/** @type {MakeBorrowInvitation} */
export const makeBorrowInvitation = (zcf, config) => {
  const {
    priceOracle,
    mmr,
    makeCloseLoanInvitation,
    makeAddCollateralInvitation,
    lenderSeat,
    periodAsyncIterable,
    interestRate,
  } = config;

  const maxLoan = lenderSeat.getAmountAllocated('Loan');

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

    // Assert that wantedLoan <= maxLoan
    assert(
      loanMath.isGTE(maxLoan, wantedLoan),
      details`The wanted loan ${wantedLoan} must be below or equal to the maximum possible loan ${maxLoan}`,
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

    const debtCalculatorConfig = {
      calcInterestFn: calculateInterest,
      originalDebt: wantedLoan,
      debtMath: loanMath,
      periodAsyncIterable,
      interestRate,
    };
    const { getDebt } = makeDebtCalculator(harden(debtCalculatorConfig));

    // The liquidationTriggerValue is when the value of the collateral
    // equals mmr percent of the wanted loan
    // Formula: liquidationTriggerValue = (wantedLoan * mmr) / 100
    const liquidationTriggerValue = loanMath.make(
      natSafeMath.floorDivide(natSafeMath.multiply(wantedLoan.value, mmr), 100),
    );

    const liquidationPromiseKit = makePromiseKit();

    const configWithBorrower = {
      ...config,
      getDebt,
      collateralSeat,
      liquidationTriggerValue,
      liquidationPromiseKit,
    };

    scheduleLiquidation(zcf, configWithBorrower);

    // The borrower can set up their own margin calls by getting the
    // priceOracle from the terms and calling
    // `E(priceOracle).priceWhenLT(collateralGiven, x)` where x is
    // the priceLimit at which they want a reminder to addCollateral.

    // TODO: Add ability to liquidate partially
    // TODO: Add ability to withdraw excess collateral
    // TODO: Add ability to repay partially

    /** @type {BorrowFacet} */
    const borrowFacet = {
      makeCloseLoanInvitation: () =>
        makeCloseLoanInvitation(zcf, configWithBorrower),
      makeAddCollateralInvitation: () =>
        makeAddCollateralInvitation(zcf, configWithBorrower),
      getLiquidationPromise: () => liquidationPromiseKit.promise,
      getDebt: () => {
        console.log('getDebt called');
        return getDebt();
      },
    };

    return harden(borrowFacet);
  };

  const customBorrowProps = harden({ maxLoan });

  return zcf.makeInvitation(borrow, 'borrow', customBorrowProps);
};
