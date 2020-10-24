// ts-check

import '../../../../exported';

// eslint-disable-next-line import/no-extraneous-dependencies
import '@agoric/install-ses';
// eslint-disable-next-line import/no-extraneous-dependencies
import test from 'ava';

import { setupLoanUnitTest, makeSeatKit, checkDetails } from './helpers';

import { makeBorrowInvitation } from '../../../../src/contracts/loan/borrow';

test('borrow customProps', async t => {
  const {
    zcf,
    zoe,
    loanKit,
    installation,
    instance,
  } = await setupLoanUnitTest();
  // Set up the lender seat
  const maxLoan = loanKit.amountMath.make(100);
  const { zcfSeat: lenderSeat } = await makeSeatKit(
    zcf,
    { give: { Loan: maxLoan } },
    { Loan: loanKit.mint.mintPayment(maxLoan) },
  );
  const mmr = undefined;
  const priceOracle = undefined;
  const autoswap = undefined;

  const config = { lenderSeat, mmr, priceOracle, autoswap };
  const borrowInvitation = makeBorrowInvitation(zcf, config);

  await checkDetails(t, zoe, borrowInvitation, {
    description: 'borrow',
    handle: null,
    installation,
    instance,
    maxLoan,
  });
});

test.todo('borrow makeCloseLoanInvitation');
test.todo('borrow makeAddCollateralInvitation');
test.todo('borrow makeMarginCallNotifier');
test.todo('borrow getLiquidationNotifier');
test.todo('borrow bad proposal');
