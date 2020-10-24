// ts-check

import '../../../../exported';

// eslint-disable-next-line import/no-extraneous-dependencies
import '@agoric/install-ses';
// eslint-disable-next-line import/no-extraneous-dependencies
import test from 'ava';
import { E } from '@agoric/eventual-send';

import { makeAddCollateralInvitation } from '../../../../src/contracts/loan/addCollateral';

import {
  setupLoanUnitTest,
  makeSeatKit,
  checkDescription,
  checkPayouts,
} from './helpers';

test.todo('makeAddCollateralInvitation - test bad proposal');

test('makeAddCollateralInvitation', async t => {
  const { zcf, zoe, collateralKit, loanKit } = await setupLoanUnitTest();

  const collateral = collateralKit.amountMath.make(10);

  // Set up the collateral seat
  const { zcfSeat: collateralSeat } = await makeSeatKit(
    zcf,
    { give: { Collateral: collateral } },
    {
      Collateral: collateralKit.mint.mintPayment(collateral),
    },
  );

  const config = { collateralSeat };
  const addCollateralInvitation = makeAddCollateralInvitation(zcf, config);

  await checkDescription(t, zoe, addCollateralInvitation, 'addCollateral');

  const addedAmount = collateralKit.amountMath.make(3);

  const proposal = harden({
    give: { Collateral: addedAmount },
  });

  const payments = harden({
    Collateral: collateralKit.mint.mintPayment(addedAmount),
  });

  const seat = await E(zoe).offer(addCollateralInvitation, proposal, payments);

  t.is(
    await seat.getOfferResult(),
    'a warm fuzzy feeling that you are further away from default than ever before',
  );

  await checkPayouts(
    t,
    seat,
    { Loan: loanKit, Collateral: collateralKit },
    {
      Loan: loanKit.amountMath.getEmpty(),
      Collateral: collateralKit.amountMath.getEmpty(),
    },
    'addCollateralSeat',
  );

  // Ensure the collSeat gets the added collateral

  t.deepEqual(collateralSeat.getCurrentAllocation(), {
    Collateral: collateralKit.amountMath.add(collateral, addedAmount),
  });
});
