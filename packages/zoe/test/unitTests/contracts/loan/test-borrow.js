// ts-check

import '../../../../exported';

// eslint-disable-next-line import/no-extraneous-dependencies
import '@agoric/install-ses';
// eslint-disable-next-line import/no-extraneous-dependencies
import test from 'ava';

import { E } from '@agoric/eventual-send';

import { MathKind, makeIssuerKit } from '@agoric/ERTP';
import { makePromiseKit } from '@agoric/promise-kit';
import { natSafeMath } from '../../../../src/contractSupport';

import {
  setupLoanUnitTest,
  makeSeatKit,
  checkDetails,
  checkDescription,
} from './helpers';

import { makeBorrowInvitation } from '../../../../src/contracts/loan/borrow';

const setupBorrow = async () => {
  const setup = await setupLoanUnitTest();
  const { zcf, loanKit } = setup;
  // Set up the lender seat
  const maxLoan = loanKit.amountMath.make(100);
  const { zcfSeat: lenderSeat } = await makeSeatKit(
    zcf,
    { give: { Loan: maxLoan } },
    { Loan: loanKit.mint.mintPayment(maxLoan) },
  );
  const mmr = 150;

  const quoteIssuerKit = makeIssuerKit('quote', MathKind.SET);

  // Hard-code collateral to be 2x as valuable as the loan brand
  // One unit of collateral = 2 loan tokens.

  const priceBelowPromiseKit = makePromiseKit();
  const triggerPriceBelow = (assetAmount, price, timer = {}, timestamp = 1) => {
    const quoteValue = harden([
      {
        assetAmount,
        price,
        timer,
        timestamp,
      },
    ]);
    const quoteAmount = quoteIssuerKit.amountMath.make(quoteValue);
    const quotePayment = quoteIssuerKit.mint.mintPayment(quoteAmount);
    const quote = harden({ quoteAmount, quotePayment });
    priceBelowPromiseKit.resolve(quote);
  };

  const priceOracle = {
    getInputPrice: (amountIn, _brandOut) => {
      return loanKit.amountMath.make(natSafeMath.multiply(amountIn.value, 2));
    },
    priceWhenBelow: (_assetAmount, _priceLimit) => priceBelowPromiseKit.promise,
  };

  const autoswap = {};

  const liquidate = (_zcf, _config, expectedValue) => expectedValue;

  const makeCloseLoanInvitation = (_zcf, _config) => 'closeLoanInvitation';

  const makeAddCollateralInvitation = (_zcf, _config) =>
    'addCollateralInvitation';

  const config = {
    lenderSeat,
    mmr,
    priceOracle,
    autoswap,
    liquidate,
    makeCloseLoanInvitation,
    makeAddCollateralInvitation,
  };
  const borrowInvitation = makeBorrowInvitation(zcf, config);
  return {
    ...setup,
    borrowInvitation,
    maxLoan,
    triggerPriceBelow,
    quoteIssuerKit,
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
  const { borrowFacet } = await setupBorrowFacet();
  const addCollateralInvitation = await E(
    borrowFacet,
  ).makeAddCollateralInvitation();
  t.is(addCollateralInvitation, 'addCollateralInvitation');
});

test('borrow getLiquidationPromise', async t => {
  const {
    borrowFacet,
    triggerPriceBelow,
    quoteIssuerKit,
    collateralKit,
    loanKit,
  } = await setupBorrowFacet(100);
  const liquidationPromise = E(borrowFacet).getLiquidationPromise();

  const collateralGiven = collateralKit.amountMath.make(100);
  const liquidationTriggerValue = loanKit.amountMath.make(150);
  triggerPriceBelow(collateralGiven, liquidationTriggerValue);
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
test.todo('borrow bad proposal');
