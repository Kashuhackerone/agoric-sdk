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
    makeLiquidate,
    makeCloseLoanInvitation,
    makeAddCollateralInvitation,
    lenderSeat,
  } = config;
  /** @type {OfferHandler} */
  const borrow = async borrowerSeat => {
    assertProposalShape(borrowerSeat, {
      give: { Collateral: null },
      want: { Loan: null },
      exit: { waived: null }, // Does this have to be waived?
    });

    const collateralGiven = borrowerSeat.getAmountAllocated('Collateral');
    const loanBrand = zcf.getTerms().brands.Loan;
    const loanMath = zcf.getTerms().maths.Loan;
    const collMath = zcf.getTerms().maths.Collateral;
    const wantedLoan = borrowerSeat.getProposal().want.Loan;

    // The value of the collateral in the Loan brand
    const collateralValue = await E(priceOracle).getPrice(
      collateralGiven,
      loanBrand,
    );
    // AWAIT ///

    // formula: assert collateralValue*100 >= wantedLoan*mmr
    // TODO: assess for rounding errors
    assert(
      loanMath.isGTE(
        natSafeMath.multiply(collateralValue.value, 100),
        natSafeMath.multiply(wantedLoan.value * mmr),
      ),
      details`The required margin is ${mmr} of ${wantedLoan} but collateral only had value of ${collateralValue}`,
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

    // Transfer *all* collateral to the collateral seat.
    trade(
      zcf,
      {
        seat: collateralSeat,
        gains: { Collateral: collateralGiven },
      },
      { seat: borrowerSeat, gains: {} },
    );

    // Transfer only the wanted Loan amount to the borrower seat

    trade(
      zcf,
      {
        seat: lenderSeat,
        gains: {},
      },
      { seat: borrowerSeat, gains: { Loan: wantedLoan } },
    );

    // We now exit the borrower seat so that the borrower gets their
    // loan. However, the borrower gets an object as their offerResult
    // that will let them continue to interact with the contract.
    borrowerSeat.exit();

    // TODO: set up automatic liquidation with the priceOracle calling
    // liquidate at a certain price

    // The liquidationTriggerValue is when the value of the collateral
    // equals mmr percent of the wanted loan
    // Formula: liquidationTriggerValue = (wantedLoan * mmr) / 100
    const liquidationTriggerValue = natSafeMath.floorDivide(
      natSafeMath.multiply(wantedLoan, mmr),
      100,
    );
    const debt = wantedLoan;

    // TODO: calculate interest
    // QUESTION: how is interest (aka stability fee on Maker) calculated?
    // Maker calculates on every block?
    const getInterest = () => loanMath.getEmpty();
    const getDebt = () => loanMath.add(debt, getInterest());

    const configWithBorrower = { ...config, getDebt, collateralSeat };

    E(priceOracle)
      .setWakeup(
        liquidationTriggerValue,
        harden({
          wake: makeLiquidate(zcf, configWithBorrower),
        }),
      )
      .catch(err => {
        console.error(
          `Could not schedule automatic liquidation at the liquidationTriggerValue ${liquidationTriggerValue} using this priceOracle ${priceOracle}`,
        );
        console.error(err);
        throw err;
      });

    // TODO: set up a notifier available to the borrower to know when
    // their collateral is *actually* getting liquidated (this is not a margin
    // call, see below)
    const getLiquidationNotifier = () => {};

    // TODO: allow the borrower to set up notifications at various
    // prices to automate the margin call process
    const makeMarginCallNotifier = () => {};

    // TODO: Add ability to liquidate partially
    // TODO: Add ability to withdraw excess collateral
    // TODO: Add ability to repay partially
    return harden({
      makeCloseLoanInvitation: () =>
        makeCloseLoanInvitation(zcf, configWithBorrower),
      makeAddCollateralInvitation: () =>
        makeAddCollateralInvitation(zcf, configWithBorrower),
      makeMarginCallNotifier,
      getLiquidationNotifier,
    });
  };

  const customBorrowProps = harden({
    maxLoan: lenderSeat.getAmountAllocated('Loan'),
  });

  return zcf.makeInvitation(borrow, 'borrow', customBorrowProps);
};
