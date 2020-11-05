// ts-check

import '../../../../exported';

// eslint-disable-next-line import/no-extraneous-dependencies
import '@agoric/install-ses';
// eslint-disable-next-line import/no-extraneous-dependencies
import test from 'ava';

import { E } from '@agoric/eventual-send';
import { makeSubscriptionKit } from '@agoric/notifier';

import { makeLocalAmountMath } from '@agoric/ertp';
import {
  setupLoanUnitTest,
  makeSeatKit,
  checkDetails,
  performAddCollateral,
  checkDescription,
} from './helpers';

import { makeFakePriceAuthority } from '../../../fakePriceAuthority';
import buildManualTimer from '../../../../tools/manualTimer';

import { makeBorrowInvitation } from '../../../../src/contracts/loan/borrow';
import { makeAddCollateralInvitation } from '../../../../src/contracts/loan/addCollateral';
import { makeCloseLoanInvitation } from '../../../../src/contracts/loan/close';

const setupBorrow = async (maxLoanValue = 100) => {
  const setup = await setupLoanUnitTest();
  const { zcf, loanKit, collateralKit } = setup;
  // Set up the lender seat
  const maxLoan = loanKit.amountMath.make(maxLoanValue);
  const { zcfSeat: lenderSeat, userSeat: lenderUserSeat } = await makeSeatKit(
    zcf,
    { give: { Loan: maxLoan } },
    { Loan: loanKit.mint.mintPayment(maxLoan) },
  );
  const mmr = 150;

  const amountMaths = new Map();
  amountMaths.set(
    collateralKit.brand.getAllegedName(),
    collateralKit.amountMath,
  );
  amountMaths.set(loanKit.brand.getAllegedName(), loanKit.amountMath);

  const priceSchedule = [
    { time: 0, price: 2 },
    { time: 1, price: 1 },
  ];
  const timer = buildManualTimer(console.log);

  const priceAuthority = makeFakePriceAuthority(
    amountMaths,
    priceSchedule,
    timer,
  );

  const autoswapInstance = harden({});

  let liquidated = false;
  const liquidate = (_zcf, _config, _expectedValue) => (liquidated = true);

  const {
    publication: periodUpdater,
    subscription: periodSubscription,
  } = makeSubscriptionKit();

  const interestRate = 5;

  const config = {
    lenderSeat,
    mmr,
    autoswapInstance,
    priceAuthority,
    liquidate,
    makeCloseLoanInvitation,
    makeAddCollateralInvitation,
    periodAsyncIterable: periodSubscription,
    interestRate,
  };
  // @ts-ignore
  const borrowInvitation = makeBorrowInvitation(zcf, config);
  return {
    ...setup,
    borrowInvitation,
    maxLoan,
    lenderUserSeat,
    liquidated,
    periodUpdater,
    periodAsyncIterable: periodSubscription,
    timer,
    priceAuthority,
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
  /** @type {ERef<BorrowFacet>} */
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

test('borrow getDebtNotifier', async t => {
  const { borrowFacet, maxLoan } = await setupBorrowFacet();
  const debtNotifier = await E(borrowFacet).getDebtNotifier();
  const state = await debtNotifier.getUpdateSince();
  t.deepEqual(state.value, maxLoan);
});

test('borrow getLiquidationPromise', async t => {
  const {
    borrowFacet,
    collateralKit,
    loanKit,
    priceAuthority,
    timer,
  } = await setupBorrowFacet(100);
  const liquidationPromise = E(borrowFacet).getLiquidationPromise();

  const collateralGiven = collateralKit.amountMath.make(100);

  const quoteIssuer = await E(priceAuthority).getQuoteIssuer(
    collateralKit.brand,
    loanKit.brand,
  );
  const quoteAmountMath = await makeLocalAmountMath(quoteIssuer);

  // According to the schedule, the value of the collateral moves from
  // 2x the loan brand to only 1x the loan brand at time 1.
  await timer.tick();

  const { quoteAmount, quotePayment } = await liquidationPromise;
  const quoteAmount2 = await E(quoteIssuer).getAmountOf(quotePayment);

  t.deepEqual(quoteAmount, quoteAmount2);
  t.deepEqual(
    quoteAmount,
    quoteAmountMath.make(
      harden([
        {
          amountIn: collateralGiven,
          amountOut: loanKit.amountMath.make(100),
          timer,
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
    liquidated,
    priceAuthority,
    timer,
  } = await setupBorrowFacet(100);
  const liquidationPromise = E(borrowFacet).getLiquidationPromise();

  const addCollateralInvitation = await E(
    borrowFacet,
  ).makeAddCollateralInvitation();

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

  const quoteIssuer = await E(priceAuthority).getQuoteIssuer(
    collateralKit.brand,
    loanKit.brand,
  );
  const quoteAmountMath = await makeLocalAmountMath(quoteIssuer);

  await timer.tick();
  await timer.tick();

  const { quoteAmount, quotePayment } = await liquidationPromise;
  const quoteAmount2 = await E(quoteIssuer).getAmountOf(quotePayment);

  t.deepEqual(quoteAmount, quoteAmount2);
  t.deepEqual(
    quoteAmount,
    quoteAmountMath.make(
      harden([
        {
          amountIn: collateralGiven,
          amountOut: loanKit.amountMath.make(103),
          timer,
          timestamp: 2,
        },
      ]),
    ),
  );

  t.falsy(liquidated);
});

test('getDebtNotifier with interest', async t => {
  const {
    borrowFacet,
    maxLoan,
    periodUpdater,
    zoe,
    collateralKit,
    loanKit,
  } = await setupBorrowFacet(100000, 40000);
  const debtNotifier = await E(borrowFacet).getDebtNotifier();

  const { value: originalDebt, updateCount } = await E(
    debtNotifier,
  ).getUpdateSince();
  t.deepEqual(originalDebt, maxLoan);

  periodUpdater.updateState();

  const { value: debtCompounded1, updateCount: updateCount1 } = await E(
    debtNotifier,
  ).getUpdateSince(updateCount);
  t.deepEqual(debtCompounded1, loanKit.amountMath.make(40020));

  periodUpdater.updateState();

  const { value: debtCompounded2 } = await E(debtNotifier).getUpdateSince(
    updateCount1,
  );
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
