// ts-check
import '../../../../exported';

// eslint-disable-next-line import/no-extraneous-dependencies
import '@agoric/install-ses';
// eslint-disable-next-line import/no-extraneous-dependencies
import test from 'ava';
import { E } from '@agoric/eventual-send';

import { setupLoanEndToEnd, checkDetails, checkPayout } from './helpers';

test.todo('loan - no mmr');
test.todo('loan - bad mmr');
test.todo('loan - no priceOracle');
test.todo('loan - badPriceOracle');
test.todo('loan - bad autoswap, no autoswap');
test.todo('loan - wrong keywords');

test.todo('loan - lend - wrong exit rule');
test.todo('loan - lend - must want nothing');

test('loan - lend - exit before borrow', async t => {
  const {
    lendInvitation,
    loanKit,
    zoe,
    installation,
    instance,
  } = await setupLoanEndToEnd();

  const maxLoan = loanKit.amountMath.make(1000);

  // Alice is willing to lend Loan tokens
  const proposal = harden({
    give: { Loan: maxLoan },
  });

  const payments = harden({
    Loan: loanKit.mint.mintPayment(maxLoan),
  });

  const lenderSeat = await E(zoe).offer(lendInvitation, proposal, payments);

  const borrowInvitation = await E(lenderSeat).getOfferResult();

  await checkDetails(t, zoe, borrowInvitation, {
    description: 'borrow',
    handle: null,
    installation,
    instance,
    maxLoan,
  });

  await E(lenderSeat).tryExit();

  // Usually, the payout is received when either 1) the loan is repaid or 2) the
  // collateral is liquidated.
  await checkPayout(t, lenderSeat, 'Loan', loanKit, maxLoan);
});
