// ts-check

import '../../../../exported';

// eslint-disable-next-line import/no-extraneous-dependencies
import '@agoric/install-ses';
// eslint-disable-next-line import/no-extraneous-dependencies
import test from 'ava';

import { makeAddCollateralInvitation } from '../../../../src/contracts/loan/addCollateral';
import { } from '../../../test/fakePriceAuthority';

import {
  setupLoanUnitTest,
  makeSeatKit,
  performAddCollateral,
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

  const { priceAuthority } = makePriceAuthority(loanKit);
  
  const autoswapInstance = {};

  const config = { collateralSeat, autoswapInstance, priceAuthority };
  const addCollateralInvitation = makeAddCollateralInvitation(zcf, config);

  const addedAmount = collateralKit.amountMath.make(3);

  await performAddCollateral(
    t,
    zoe,
    collateralKit,
    loanKit,
    addCollateralInvitation,
    addedAmount,
  );

  // Ensure the collSeat gets the added collateral

  t.deepEqual(collateralSeat.getCurrentAllocation(), {
    Collateral: collateralKit.amountMath.add(collateral, addedAmount),
  });
});
