// ts-check

import '../../../exported';

// eslint-disable-next-line import/no-extraneous-dependencies
import '@agoric/install-ses';
// eslint-disable-next-line import/no-extraneous-dependencies
import test from 'ava';

import bundleSource from '@agoric/bundle-source';
import { E } from '@agoric/eventual-send';

import { setup } from '../setupBasicMints';

import { makeLendInvitation } from '../../../src/contracts/loan/lend';
import { makeCloseLoanInvitation } from '../../../src/contracts/loan/close';
import { setupZCFTest } from '../zcf/setupZcfTest';

const loanRoot = `${__dirname}/../../../src/contracts/loan/vault`;

const checkPayout = async (t, seat, keyword, kit, expected, message = '') => {
  const payout = await E(seat).getPayout(keyword);
  const amount = await kit.issuer.getAmountOf(payout);
  t.truthy(kit.amountMath.isEqual(amount, expected));
  t.truthy(seat.hasExited());
};

const checkDescription = async (t, zoe, invitation, expected) => {
  const details = await E(zoe).getInvitationDetails(invitation);
  t.is(details.description, expected);
};

const checkDetails = async (t, zoe, invitation, expectedNullHandle) => {
  const details = await E(zoe).getInvitationDetails(invitation);
  const detailsNullHandle = { ...details, handle: null };
  t.deepEqual(detailsNullHandle, expectedNullHandle);
};

/**
 * @param {any} t
 * @param {UserSeat} seat
 * @param {Record<Keyword, IssuerKit>} kitKeywordRecord
 * @param {AmountKeywordRecord} expectedKeywordRecord
 * @param message
 */
const checkPayouts = async (
  t,
  seat,
  kitKeywordRecord,
  expectedKeywordRecord,
  message = '',
) => {
  const payouts = await E(seat).getPayouts();
  Object.entries(payouts).forEach(async ([keyword, paymentP]) => {
    const kit = kitKeywordRecord[keyword];
    const amount = await kit.issuer.getAmountOf(paymentP);
    const expected = expectedKeywordRecord[keyword];
    t.truthy(
      kit.amountMath.isEqual(amount, expected),
      `amount value: ${amount.value}, expected value: ${expected.value}, message: ${message}`,
    );
  });
  t.truthy(seat.hasExited());
};

const setupLoanUnitTest = async (
  terms = harden({
    mmr: 150,
    priceOracle: {},
  }),
) => {
  const { moolaKit: collateralKit, simoleanKit: loanKit } = setup();

  const issuerKeywordRecord = harden({
    Collateral: collateralKit.issuer,
    Loan: loanKit.issuer,
  });

  const { zcf, zoe } = await setupZCFTest(issuerKeywordRecord, terms);

  return {
    zcf,
    zoe,
    collateralKit,
    loanKit,
  };
};

const checkNoNewOffers = async (t, zcf) => {
  const newInvitation = zcf.makeInvitation(() => {}, 'noop');
  const zoe = zcf.getZoeService();
  await t.throwsAsync(() => E(zoe).offer(newInvitation), {
    message: 'No further offers are accepted',
  });
};

const makeSeatKit = async (zcf, proposal, payments) => {
  let zcfSeat;
  const invitation = zcf.makeInvitation(seat => {
    zcfSeat = seat;
  }, 'seat');
  const zoe = zcf.getZoeService();
  const userSeat = await E(zoe).offer(invitation, proposal, payments);
  return harden({ zcfSeat, userSeat });
};

test.todo('loan - no mmr');
test.todo('loan - bad mmr');
test.todo('loan - no priceOracle');
test.todo('loan - badPriceOracle');
test.todo('loan - wrong keywords');

const startContract = async (mmr, priceOracle) => {
  const { moolaKit: collateralKit, simoleanKit: loanKit, zoe } = setup();
  const bundle = await bundleSource(loanRoot);
  const installation = await E(zoe).install(bundle);

  const issuerKeywordRecord = harden({
    Collateral: collateralKit.issuer,
    Loan: loanKit.issuer,
  });
  const terms = harden({
    mmr,
    priceOracle,
  });
  const { creatorInvitation: lendInvitation, instance } = await E(
    zoe,
  ).startInstance(installation, issuerKeywordRecord, terms);

  const invitationIssuer = await E(zoe).getInvitationIssuer();

  return {
    lendInvitation,
    collateralKit,
    loanKit,
    zoe,
    invitationIssuer,
    installation,
    instance,
  };
};

test.todo('loan - lend - wrong exit rule');
test.todo('loan - lend - must want nothing');

test('loan - lend - exit before borrow', async t => {
  const {
    lendInvitation,
    loanKit,
    zoe,
    installation,
    instance,
  } = await startContract(150, {});

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

test('makeLendInvitation', async t => {
  const { moolaKit: collateralKit, simoleanKit: loanKit } = setup();

  const issuerKeywordRecord = harden({
    Collateral: collateralKit.issuer,
    Loan: loanKit.issuer,
  });
  const terms = harden({
    mmr: 150,
    priceOracle: {},
  });
  const { zcf, zoe } = await setupZCFTest(issuerKeywordRecord, terms);

  const makeBorrowInvitation = () => 'imaginary borrow invitation';
  const lendInvitation = makeLendInvitation(zcf, makeBorrowInvitation, 150, {});

  await checkDescription(lendInvitation, 'lend');

  const maxLoan = loanKit.amountMath.make(1000);

  const proposal = harden({
    give: { Loan: maxLoan },
  });

  const payments = harden({
    Loan: loanKit.mint.mintPayment(maxLoan),
  });

  const lenderSeat = await E(zoe).offer(lendInvitation, proposal, payments);

  const borrowInvitation = await E(lenderSeat).getOfferResult();
  t.is(borrowInvitation, 'imaginary borrow invitation');
});

test.todo('makeCloseLoanInvitation repay partial fails');
test.todo(`makeCloseLoanInvitation repay but don't repay interest`);
test.todo(`repay but wrong proposal type`);
test.todo(`repay - request too much collateral`);



test('makeCloseLoanInvitation repay all', async t => {
  const { zcf, zoe, collateralKit, loanKit } = await setupLoanUnitTest();

  const collateral = collateralKit.amountMath.make(10);

  // Set up the collateral seat
  const { zcfSeat: collSeat } = await makeSeatKit(
    zcf,
    harden({ give: { Collateral: collateral } }),
    harden({
      Collateral: collateralKit.mint.mintPayment(collateral),
    }),
  );

  // Set up the lender seat
  const {
    zcfSeat: lenderSeat,
    userSeat: lenderUserSeatP,
  } = zcf.makeEmptySeatKit();

  const borrowedAmount = loanKit.amountMath.make(20);
  const interest = loanKit.amountMath.make(3);
  const required = loanKit.amountMath.add(borrowedAmount, interest);
  const getBorrowedAmount = () => borrowedAmount;
  const getInterest = () => interest;

  const closeLoanInvitation = makeCloseLoanInvitation(
    zcf,
    collSeat,
    lenderSeat,
    getBorrowedAmount,
    getInterest,
  );

  await checkDescription(t, zoe, closeLoanInvitation, 'repayAndClose');

  const proposal = harden({
    give: { Loan: required },
    want: { Collateral: collateralKit.amountMath.make(10) },
  });

  const payments = harden({
    Loan: loanKit.mint.mintPayment(required),
  });

  const seat = await E(zoe).offer(closeLoanInvitation, proposal, payments);

  t.is(
    await seat.getOfferResult(),
    'your loan is closed, thank you for your business',
  );

  await checkPayouts(
    t,
    seat,
    { Loan: loanKit, Collateral: collateralKit },
    {
      Loan: loanKit.amountMath.getEmpty(),
      Collateral: collateralKit.amountMath.make(10),
    },
    'repaySeat',
  );

  // Ensure the lender gets the entire loan repayment and none of the
  // collateral

  const lenderUserSeat = await lenderUserSeatP;

  await checkPayouts(
    t,
    lenderUserSeat,
    { Loan: loanKit, Collateral: collateralKit },
    {
      Loan: required,
      Collateral: collateralKit.amountMath.getEmpty(),
    },
    'lenderSeat',
  );

  // Ensure all seats have exited
  t.truthy(collSeat.hasExited());

  // Ensure no new offers can be made
  await checkNoNewOffers(t, zcf);
});
