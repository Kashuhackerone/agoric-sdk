import '../../../../exported';

// eslint-disable-next-line import/no-extraneous-dependencies
import '@agoric/install-ses';
import { E } from '@agoric/eventual-send';
import bundleSource from '@agoric/bundle-source';

import { makeIssuerKit, MathKind } from '@agoric/ertp';
import { makePromiseKit } from '@agoric/promise-kit';
import { natSafeMath } from '../../../../src/contractSupport';

import { setup } from '../../setupBasicMints';
import { setupZCFTest } from '../../zcf/setupZcfTest';

const loanRoot = `${__dirname}/../../../../src/contracts/loan/`;

/**
 * @param {import("ava").ExecutionContext<unknown>} t
 * @param {UserSeat} seat
 * @param {Keyword} keyword
 * @param {IssuerKit} kit
 * @param {Amount} expected
 * @param {string} message
 */
export const checkPayout = async (
  t,
  seat,
  keyword,
  kit,
  expected,
  message = '',
) => {
  const payout = await E(seat).getPayout(keyword);
  const amount = await kit.issuer.getAmountOf(payout);
  t.truthy(kit.amountMath.isEqual(amount, expected), message);
  t.truthy(seat.hasExited(), message);
};

/**
 * @param {import("ava").ExecutionContext<unknown>} t
 * @param {ZoeService} zoe
 * @param {ERef<Invitation>} invitation
 * @param {string} expected
 */
export const checkDescription = async (t, zoe, invitation, expected) => {
  const details = await E(zoe).getInvitationDetails(invitation);
  t.is(details.description, expected);
};

/**
 * @param {import("ava").ExecutionContext<unknown>} t
 * @param {ZoeService} zoe
 * @param {ERef<Invitation>} invitation
 * @param {InvitationDetails} expectedNullHandle expected invitation
 * details with the handle set to 'null'
 */
export const checkDetails = async (t, zoe, invitation, expectedNullHandle) => {
  const details = await E(zoe).getInvitationDetails(invitation);
  const detailsNullHandle = { ...details, handle: null };
  t.deepEqual(detailsNullHandle, expectedNullHandle);
};

/**
 * @param {any} t
 * @param {UserSeat} seat
 * @param {Record<Keyword, IssuerKit>} kitKeywordRecord
 * @param {AmountKeywordRecord} expectedKeywordRecord
 * @param {string} message
 */
export const checkPayouts = async (
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

export const setupLoanEndToEnd = async (
  terms = harden({
    mmr: 150,
    autoswapInstance: {},
  }),
) => {
  const { moolaKit: collateralKit, simoleanKit: loanKit, zoe } = setup();
  const bundle = await bundleSource(loanRoot);
  const installation = await E(zoe).install(bundle);

  const issuerKeywordRecord = harden({
    Collateral: collateralKit.issuer,
    Loan: loanKit.issuer,
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

export const setupLoanUnitTest = async (
  terms = harden({
    mmr: 150,
    autoswapInstance: {},
  }),
) => {
  const { moolaKit: collateralKit, simoleanKit: loanKit } = setup();

  const issuerKeywordRecord = harden({
    Collateral: collateralKit.issuer,
    Loan: loanKit.issuer,
  });

  const { zcf, zoe, installation, instance } = await setupZCFTest(
    issuerKeywordRecord,
    terms,
  );

  return {
    zcf,
    zoe,
    collateralKit,
    loanKit,
    installation,
    instance,
  };
};

export const checkNoNewOffers = async (t, zcf) => {
  const newInvitation = zcf.makeInvitation(() => {}, 'noop');
  const zoe = zcf.getZoeService();
  await t.throwsAsync(() => E(zoe).offer(newInvitation), {
    message: 'No further offers are accepted',
  });
};

export const makeSeatKit = async (zcf, proposal, payments) => {
  let zcfSeat;
  const invitation = zcf.makeInvitation(seat => {
    zcfSeat = seat;
  }, 'seat');
  const zoe = zcf.getZoeService();
  const userSeat = await E(zoe).offer(
    invitation,
    harden(proposal),
    harden(payments),
  );
  return harden({ zcfSeat, userSeat });
};

export const makePriceAuthority = loanKit => {
  const quoteIssuerKit = makeIssuerKit('quote', MathKind.SET);

  // array of objects with { assetAmount, priceLimit, promiseKit }
  const priceBelowPromiseKitEntries = [];

  const resolvePromiseKitEntry = (promiseKitEntry, timer, timestamp) => {
    const { assetAmount, priceLimit: price, promiseKit } = promiseKitEntry;
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
    promiseKit.resolve(quote);
  };

  const adminTestingFacet = {
    getPriceBelowPromiseKitEntries: () => priceBelowPromiseKitEntries,
    resolvePromiseKitEntry,
    quoteIssuerKit,
  };

  const priceAuthority = {
    quoteGiven: (amountIn, _brandOut) => {
      return loanKit.amountMath.make(natSafeMath.multiply(amountIn.value, 2));
    },
    quoteWhenLT: (assetAmount, priceLimit) => {
      const promiseKit = makePromiseKit();
      priceBelowPromiseKitEntries.push(
        harden({ assetAmount, priceLimit, promiseKit }),
      );
      return promiseKit.promise;
    },
    getQuoteIssuer: quoteIssuerKit.issuer,
  };

  return harden({
    priceAuthority,
    adminTestingFacet,
  });
};

/**
 * @callback PerformAddCollateral
 * @param {import("ava").ExecutionContext<unknown>} t
 * @param {ZoeService} zoe
 * @param {IssuerKit} collateralKit
 * @param {IssuerKit} loanKit
 * @param {ERef<Payment>} addCollateralInvitation
 * @param {Amount} addedAmount amount of collateral to add
 */
export const performAddCollateral = async (
  t,
  zoe,
  collateralKit,
  loanKit,
  addCollateralInvitation,
  addedAmount,
) => {
  await checkDescription(t, zoe, addCollateralInvitation, 'addCollateral');

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
};
