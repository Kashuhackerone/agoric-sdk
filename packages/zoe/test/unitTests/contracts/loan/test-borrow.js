// ts-check

import '../../../../exported';

// eslint-disable-next-line import/no-extraneous-dependencies
import '@agoric/install-ses';
// eslint-disable-next-line import/no-extraneous-dependencies
import test from 'ava';

import { E } from '@agoric/eventual-send';
import { makePromiseKit } from '@agoric/promise-kit';

import {
  setupLoanUnitTest,
  makeSeatKit,
  checkDetails,
  makePriceOracle,
  performAddCollateral,
  checkDescription,
} from './helpers';

import { makeBorrowInvitation } from '../../../../src/contracts/loan/borrow';

import { makeAddCollateralInvitation } from '../../../../src/contracts/loan/addCollateral';

const setupBorrow = async () => {
  const setup = await setupLoanUnitTest();
  const { zcf, loanKit } = setup;
  // Set up the lender seat
  const maxLoan = loanKit.amountMath.make(100);
  const { zcfSeat: lenderSeat, userSeat: lenderUserSeat } = await makeSeatKit(
    zcf,
    { give: { Loan: maxLoan } },
    { Loan: loanKit.mint.mintPayment(maxLoan) },
  );
  const mmr = 150;

  const { priceOracle, adminTestingFacet } = makePriceOracle(loanKit);

  const autoswap = {};

  let liquidated = false;
  const liquidate = (_zcf, _config, _expectedValue) => (liquidated = true);

  const makeCloseLoanInvitation = (_zcf, _config) => 'closeLoanInvitation';

  const periodPromiseKit = makePromiseKit();

  const periodPromise = periodPromiseKit.promise;

  const interestRate = 5;

  const config = {
    lenderSeat,
    mmr,
    priceOracle,
    autoswap,
    liquidate,
    makeCloseLoanInvitation,
    makeAddCollateralInvitation,
    periodPromise,
    interestRate,
  };
  const borrowInvitation = makeBorrowInvitation(zcf, config);
  return {
    ...setup,
    borrowInvitation,
    maxLoan,
    adminTestingFacet,
    lenderUserSeat,
    liquidated,
    periodPromiseKit,
  };
};

const setupBorrowFacet = async (collateralValue = 1000) => {
  const setup = await setupBorrow();
  const { borrowInvitation, zoe, maxLoan, collateralKit } = setup;

  const collateral = collateralKit.amountMath.make(collateralValue);

  const proposal = harden({
    want: { Loan: maxLoan },
    give: { Collateral: collateral },
  });

  const payments = { Collateral: collateralKit.mint.mintPayment(collateral) };
  const borrowSeat = await E(zoe).offer(borrowInvitation, proposal, payments);
  const borrowFacet = E(borrowSeat).getOfferResult();

  return {
    ...setup,
    borrowSeat,
    borrowFacet,
  };
};

test('borrow assert customProps', async t => {
  const {
    borrowInvitation,
    zoe,
    installation,
    instance,
    maxLoan,
  } = await setupBorrow();

  await checkDetails(t, zoe, borrowInvitation, {
    description: 'borrow',
    handle: null,
    installation,
    instance,
    maxLoan,
  });
});

test('borrow not enough collateral', async t => {
  // collateral is 0
  const setup = await setupBorrowFacet(0);
  const { borrowSeat } = setup;
  await t.throwsAsync(() => E(borrowSeat).getOfferResult(), {
    message:
      'The required margin is approximately (an object) but collateral only had value of (an object)',
  });
});

test('borrow just enough collateral', async t => {
  const { borrowFacet } = await setupBorrowFacet(75);
  const closeLoanInvitation = await E(borrowFacet).makeCloseLoanInvitation();
  t.is(closeLoanInvitation, 'closeLoanInvitation');
});

test('borrow makeCloseLoanInvitation', async t => {
  const { borrowFacet } = await setupBorrowFacet();
  const closeLoanInvitation = await E(borrowFacet).makeCloseLoanInvitation();
  t.is(closeLoanInvitation, 'closeLoanInvitation');
});

test('borrow makeAddCollateralInvitation', async t => {
  const { borrowFacet, zoe } = await setupBorrowFacet();
  const addCollateralInvitation = await E(
    borrowFacet,
  ).makeAddCollateralInvitation();
  await checkDescription(t, zoe, addCollateralInvitation, 'addCollateral');
});

test('borrow getLiquidationPromise', async t => {
  const {
    borrowFacet,
    adminTestingFacet,
    collateralKit,
    loanKit,
  } = await setupBorrowFacet(100);
  const liquidationPromise = E(borrowFacet).getLiquidationPromise();

  const collateralGiven = collateralKit.amountMath.make(100);
  const liquidationTriggerValue = loanKit.amountMath.make(150);
  const {
    getPriceBelowPromiseKitEntries,
    resolvePromiseKitEntry,
    quoteIssuerKit,
  } = adminTestingFacet;
  const priceBelowPromiseKitEntries = getPriceBelowPromiseKitEntries();
  resolvePromiseKitEntry(priceBelowPromiseKitEntries[0], {}, 1);
  const { quoteAmount, quotePayment } = await liquidationPromise;
  const quoteAmount2 = await E(quoteIssuerKit.issuer).getAmountOf(quotePayment);

  t.deepEqual(quoteAmount, quoteAmount2);
  t.deepEqual(
    quoteAmount,
    quoteIssuerKit.amountMath.make(
      harden([
        {
          assetAmount: collateralGiven,
          price: liquidationTriggerValue,
          timer: {},
          timestamp: 1,
        },
      ]),
    ),
  );
});

// Liquidation should not happen at the old assetAmount, but should
// happen at the new assetAmount
test('borrow, then addCollateral, then getLiquidationPromise', async t => {
  const {
    borrowFacet,
    collateralKit,
    loanKit,
    zoe,
    adminTestingFacet,
    liquidated,
  } = await setupBorrowFacet(100);
  const liquidationPromise = E(borrowFacet).getLiquidationPromise();

  const addCollateralInvitation = await E(
    borrowFacet,
  ).makeAddCollateralInvitation();

  console.log(addCollateralInvitation);

  const addedAmount = collateralKit.amountMath.make(3);

  await performAddCollateral(
    t,
    zoe,
    collateralKit,
    loanKit,
    addCollateralInvitation,
    addedAmount,
  );

  const collateralGiven = collateralKit.amountMath.make(103);
  const liquidationTriggerValue = loanKit.amountMath.make(150);

  const {
    getPriceBelowPromiseKitEntries,
    resolvePromiseKitEntry,
    quoteIssuerKit,
  } = adminTestingFacet;
  const priceBelowPromiseKitEntries = getPriceBelowPromiseKitEntries();
  t.is(priceBelowPromiseKitEntries.length, 2);
  resolvePromiseKitEntry(priceBelowPromiseKitEntries[0], {}, 1);
  resolvePromiseKitEntry(priceBelowPromiseKitEntries[1], {}, 2);

  const { quoteAmount, quotePayment } = await liquidationPromise;
  const quoteAmount2 = await E(quoteIssuerKit.issuer).getAmountOf(quotePayment);

  t.deepEqual(quoteAmount, quoteAmount2);
  t.deepEqual(
    quoteAmount,
    quoteIssuerKit.amountMath.make(
      harden([
        {
          assetAmount: collateralGiven,
          price: liquidationTriggerValue,
          timer: {},
          timestamp: 2,
        },
      ]),
    ),
  );

  t.falsy(liquidated);
});

test.todo('borrow bad proposal');

test.todo('resolve periodPromise a few times and test interest');

test.todo('test interest calculations as unit test');
