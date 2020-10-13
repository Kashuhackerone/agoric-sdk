// ts-check

// eslint-disable-next-line import/no-extraneous-dependencies
import '@agoric/install-ses';
// eslint-disable-next-line import/no-extraneous-dependencies
import test from 'ava';

import bundleSource from '@agoric/bundle-source';
import { E } from '@agoric/eventual-send';

import { setup } from '../setupBasicMints';

import { makeLendInvitation } from '../../../src/contracts/loan/lend';
import { setupZCFTest } from '../zcf/setupZcfTest';

const loanRoot = `${__dirname}/../../../src/contracts/loan/vault`;

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
  const borrowInvitationDetails = await E(zoe).getInvitationDetails(
    borrowInvitation,
  );

  t.deepEqual(await E(zoe).getInvitationDetails(borrowInvitation), {
    description: 'borrow',
    handle: borrowInvitationDetails.handle,
    installation,
    instance,
    maxLoan,
  });

  await E(lenderSeat).tryExit();

  // Usually, the payout is received when either 1) the loan is repaid or 2) the
  // collateral is liquidated.

  const loanPayout = await E(lenderSeat).getPayout('Loan');
  t.deepEqual(await loanKit.issuer.getAmountOf(loanPayout), maxLoan);
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
  const lendDesc = await E(zoe).getInvitationDetails(lendInvitation);

  t.deepEqual(lendDesc.description, 'lend');

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
