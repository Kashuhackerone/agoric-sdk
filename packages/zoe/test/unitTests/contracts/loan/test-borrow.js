// ts-check

import '../../../../exported';

// eslint-disable-next-line import/no-extraneous-dependencies
import '@agoric/install-ses';
// eslint-disable-next-line import/no-extraneous-dependencies
import test from 'ava';

import { updateFromIterable } from '@agoric/notifier';
import { E } from '@agoric/eventual-send';
import { makeAsyncIterableKit } from './asyncIterableKit';

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
import { makeCloseLoanInvitation } from '../../../../src/contracts/loan/close';

const setupBorrow = async (maxLoanValue = 100) => {
  const setup = await setupLoanUnitTest();
  const { zcf, loanKit } = setup;
  // Set up the lender seat
  const maxLoan = loanKit.amountMath.make(maxLoanValue);
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

  const {
    updater: periodUpdater,
    asyncIterable: periodAsyncIterable,
  } = makeAsyncIterableKit();

  const interestRate = 5;

  const config = {
    lenderSeat,
    mmr,
    priceOracle,
    autoswap,
    liquidate,
    makeCloseLoanInvitation,
    makeAddCollateralInvitation,
    periodAsyncIterable,
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
    periodUpdater,
    periodAsyncIterable,
  };
};

const setupBorrowFacet = async (collateralValue = 1000, maxLoanValue = 100) => {
  const setup = await setupBorrow(maxLoanValue);
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
  const { borrowSeat } = await setupBorrowFacet(0);
  await t.throwsAsync(() => E(borrowSeat).getOfferResult(), {
    message:
      'The required margin is approximately (an object) but collateral only had value of (an object)',
  });
});

test('borrow just enough collateral', async t => {
  const { borrowFacet, zoe } = await setupBorrowFacet(75);
  const closeLoanInvitation = await E(borrowFacet).makeCloseLoanInvitation();
  await checkDescription(t, zoe, closeLoanInvitation, 'repayAndClose');
});

test('borrow makeCloseLoanInvitation', async t => {
  const { borrowFacet, zoe } = await setupBorrowFacet();
  const closeLoanInvitation = await E(borrowFacet).makeCloseLoanInvitation();
  await checkDescription(t, zoe, closeLoanInvitation, 'repayAndClose');
});

test('borrow makeAddCollateralInvitation', async t => {
  const { borrowFacet, zoe } = await setupBorrowFacet();
  const addCollateralInvitation = await E(
    borrowFacet,
  ).makeAddCollateralInvitation();
  await checkDescription(t, zoe, addCollateralInvitation, 'addCollateral');
});

test('borrow getDebt', async t => {
  const { borrowFacet, maxLoan } = await setupBorrowFacet();
  const currentDebt = await E(borrowFacet).getDebt();
  t.deepEqual(currentDebt, maxLoan);
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

test.only('getDebt with interest', async t => {
  const {
    borrowFacet,
    maxLoan,
    periodUpdater,
    zoe,
    collateralKit,
    loanKit,
  } = await setupBorrowFacet(100000, 40000);
  const originalDebt = await E(borrowFacet).getDebt();
  t.deepEqual(originalDebt, maxLoan);

  periodUpdater.updateState();

  const debtCompounded1 = await E(borrowFacet).getDebt();
  t.deepEqual(debtCompounded1, loanKit.amountMath.make(40020));

  periodUpdater.updateState();

  const debtCompounded2 = await E(borrowFacet).getDebt();
  t.deepEqual(debtCompounded2, loanKit.amountMath.make(40040));

  const closeLoanInvitation = E(borrowFacet).makeCloseLoanInvitation();
  await checkDescription(t, zoe, closeLoanInvitation, 'repayAndClose');

  const proposal = harden({
    give: { Loan: loanKit.amountMath.make(40000) },
    want: { Collateral: collateralKit.amountMath.make(10) },
  });

  const payments = harden({
    Loan: loanKit.mint.mintPayment(loanKit.amountMath.make(40000)),
  });

  const seat = await E(zoe).offer(closeLoanInvitation, proposal, payments);

  await t.throwsAsync(() => seat.getOfferResult(), {
    message:
      'Not enough Loan assets have been repaid.  (an object) is required, but only (an object) was repaid.',
  });
});

test.todo('borrow bad proposal');

test.todo('test interest calculations as unit test');
