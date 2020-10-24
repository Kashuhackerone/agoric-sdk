// ts-check

import '../../../../exported';

// eslint-disable-next-line import/no-extraneous-dependencies
import '@agoric/install-ses';
// eslint-disable-next-line import/no-extraneous-dependencies
import test from 'ava';

import { makeLiquidate } from '../../../../src/contracts/loan/liquidate';

import {
  setupLoanUnitTest,
  makeSeatKit,
  checkNoNewOffers,
  checkPayouts,
} from './helpers';

import { trade } from '../../../../src/contractSupport';

test('test liquidate with mocked autoswap', async t => {
  const { zcf, zoe, collateralKit, loanKit } = await setupLoanUnitTest();
  // Set up the lender seat
  const maxLoan = loanKit.amountMath.make(100);
  const { zcfSeat: lenderSeat, userSeat: lenderUserSeat } = await makeSeatKit(
    zcf,
    { give: {} },
    {},
  );

  const collateral = collateralKit.amountMath.make(10);
  const { zcfSeat: collateralSeat } = await makeSeatKit(
    zcf,
    { give: { Collateral: collateral } },
    { Collateral: collateralKit.mint.mintPayment(collateral) },
  );

  const loan1000 = loanKit.amountMath.make(1000);

  // Setup fake autoswap
  const { zcfSeat: fakePoolSeat } = await makeSeatKit(
    zcf,
    { give: { Central: loan1000 } },
    { Central: loanKit.mint.mintPayment(loan1000) },
  );

  const price = loanKit.amountMath.make(20);

  const swapHandler = swapSeat => {
    // swapSeat gains 20 loan tokens from fakePoolSeat, loses all collateral

    trade(
      zcf,
      {
        seat: fakePoolSeat,
        gains: {
          Secondary: collateral,
        },
        losses: {
          Central: price,
        },
      },
      {
        seat: swapSeat,
        gains: { Out: price },
        losses: { In: collateral },
      },
    );

    swapSeat.exit();
    return `Swap successfully completed.`;
  };

  const autoswap = {
    getInputPrice: (amountIn, brandOut) => {
      // The amountIn will be `collateral`, and the brandOut is
      // loanBrand
      t.deepEqual(amountIn, collateral);
      t.is(brandOut, loanKit.brand);

      // Let's say it's worth 20 loan tokens
      return price;
    },
    makeSwapInInvitation: () => zcf.makeInvitation(swapHandler, 'swap'),
  };

  const config = { collateralSeat, autoswap, lenderSeat };
  const liquidate = await makeLiquidate(zcf, config);
  await liquidate();

  // Ensure collateralSeat exited
  t.truthy(collateralSeat.hasExited());

  // Ensure lender got payout
  await checkPayouts(
    t,
    lenderUserSeat,
    { Loan: loanKit, Collateral: collateralKit },
    { Loan: price, Collateral: collateralKit.amountMath.getEmpty() },
    'lenderSeat',
  );

  // Ensure no further offers accepted
  await checkNoNewOffers(t, zcf);
});

test.todo('test liquidate with real autoswap');
