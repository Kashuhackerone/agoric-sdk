import '@agoric/install-ses';

// eslint-disable-next-line import/no-extraneous-dependencies
import { test } from 'tape-promise/tape';
// eslint-disable-next-line import/no-extraneous-dependencies
import { E } from '@agoric/eventual-send';

import { assert, details } from '@agoric/assert';
// noinspection ES6PreferShortImport
import { setup } from '../setupBasicMints';
import { setupNonFungible } from '../setupNonFungibleMints';
import { installationPFromSource } from '../installFromSource';
import {
  assertPayoutDeposit,
  assertOfferResult,
  getInviteFields,
} from '../../zoeTestHelpers';

const simpleExchange = `${__dirname}/../../../src/contracts/simpleExchange`;

test('simpleExchange with valid offers', async t => {
  t.plan(17);
  const {
    moolaIssuer,
    simoleanIssuer,
    moolaMint,
    simoleanMint,
    amountMaths,
    moola,
    simoleans,
    zoe,
  } = setup();
  const inviteIssuer = zoe.getInvitationIssuer();
  const installation = await installationPFromSource(zoe, simpleExchange);

  // Setup Alice
  const aliceMoolaPayment = moolaMint.mintPayment(moola(3));
  const aliceMoolaPurse = moolaIssuer.makeEmptyPurse();
  const aliceSimoleanPurse = simoleanIssuer.makeEmptyPurse();

  // Setup Bob
  const bobSimoleanPayment = simoleanMint.mintPayment(simoleans(7));
  const bobMoolaPurse = moolaIssuer.makeEmptyPurse();
  const bobSimoleanPurse = simoleanIssuer.makeEmptyPurse();

  // 1: Alice creates a simpleExchange instance and spreads the publicFacet far
  // and wide with instructions on how to call makeInvite().
  const {
    creatorInvitation: aliceInvite,
    creatorFacet,
    instance,
  } = await zoe.makeInstance(installation, {
    Asset: moolaIssuer,
    Price: simoleanIssuer,
  });

  const publicFacet = await creatorFacet.getPublicFacet();

  const aliceNotifier = publicFacet.getNotifier();
  E(aliceNotifier)
    .getUpdateSince()
    .then(({ value: beforeAliceOrders, updateCount: beforeAliceCount }) => {
      t.deepEquals(
        beforeAliceOrders,
        {
          buys: [],
          sells: [],
        },
        `Order book is empty`,
      );
      t.equals(beforeAliceCount, 3);
    });

  const {
    value: initialOrders,
  } = await publicFacet.getNotifier().getUpdateSince();
  t.deepEquals(
    initialOrders,
    { buys: [], sells: [] },
    `order notifier is initialized`,
  );

  // 2: Alice escrows with zoe to create a sell order. She wants to
  // sell 3 moola and wants to receive at least 4 simoleans in
  // return.
  const aliceSellOrderProposal = harden({
    give: { Asset: moola(3) },
    want: { Price: simoleans(4) },
    exit: { onDemand: null },
  });
  const alicePayments = { Asset: aliceMoolaPayment };
  // 4: Alice adds her sell order to the exchange
  const aliceSeat = await E(zoe).offer(
    aliceInvite,
    aliceSellOrderProposal,
    alicePayments,
  );

  E(aliceNotifier)
    .getUpdateSince()
    .then(({ value: afterAliceOrders, updateCount: afterAliceCount }) => {
      t.deepEquals(
        afterAliceOrders,
        {
          buys: [],
          sells: [
            {
              want: aliceSellOrderProposal.want,
              give: aliceSellOrderProposal.give,
            },
          ],
        },
        `order notifier is updated with Alice's sell order`,
      );
      t.equals(afterAliceCount, 4);

      aliceNotifier.getUpdateSince(afterAliceCount).then(update => {
        t.notOk(update.value.sells[0], 'accepted offer from Bob');
        t.equals(update.updateCount, 5);
      });
    });

  const bobInvite = await E(publicFacet).makeInvite();
  const { installation: bobInstallation } = await getInviteFields(
    inviteIssuer,
    bobInvite,
  );

  // 5: Bob decides to join.
  const bobExclusiveInvite = await inviteIssuer.claim(bobInvite);

  const bobIssuers = zoe.getIssuers(instance);

  t.equals(bobInstallation, installation);

  assert(
    bobIssuers.Asset === moolaIssuer,
    details`The Asset issuer should be the moola issuer`,
  );
  assert(
    bobIssuers.Price === simoleanIssuer,
    details`The Price issuer should be the simolean issuer`,
  );

  // Bob creates a buy order, saying that he wants exactly 3 moola,
  // and is willing to pay up to 7 simoleans.
  const bobBuyOrderProposal = harden({
    give: { Price: simoleans(7) },
    want: { Asset: moola(3) },
    exit: { onDemand: null },
  });
  const bobPayments = { Price: bobSimoleanPayment };

  // 6: Bob escrows with zoe
  // 8: Bob submits the buy order to the exchange
  const bobSeat = await zoe.offer(
    bobExclusiveInvite,
    bobBuyOrderProposal,
    bobPayments,
  );

  const { value: afterBobOrders } = await E(
    E(publicFacet).getNotifier(),
  ).getUpdateSince();
  t.deepEquals(
    afterBobOrders,
    { buys: [], sells: [] },
    `order notifier is updated when Bob fulfills the order`,
  );

  assertOfferResult(t, bobSeat, 'Trade Successful');
  assertOfferResult(t, aliceSeat, 'Trade Successful');

  const {
    Asset: bobMoolaPayout,
    Price: bobSimoleanPayout,
  } = await bobSeat.getPayouts();

  const {
    Asset: aliceMoolaPayout,
    Price: aliceSimoleanPayout,
  } = await aliceSeat.getPayouts();

  // Alice gets paid at least what she wanted
  t.ok(
    amountMaths
      .get('simoleans')
      .isGTE(
        await simoleanIssuer.getAmountOf(aliceSimoleanPayout),
        aliceSellOrderProposal.want.Price,
      ),
    `Alice got the simoleans she wanted`,
  );

  // Alice sold all of her moola
  t.deepEquals(await moolaIssuer.getAmountOf(aliceMoolaPayout), moola(0));

  // 6: Alice deposits her payout to ensure she can
  // Alice had 0 moola and 4 simoleans.
  assertPayoutDeposit(t, aliceMoolaPayout, aliceMoolaPurse, moola(0));
  assertPayoutDeposit(t, aliceSimoleanPayout, aliceSimoleanPurse, simoleans(4));

  // 7: Bob deposits his original payments to ensure he can
  // Bob had 3 moola and 3 simoleans.
  assertPayoutDeposit(t, bobMoolaPayout, bobMoolaPurse, moola(3));
  assertPayoutDeposit(t, bobSimoleanPayout, bobSimoleanPurse, simoleans(3));
});

test('simpleExchange with multiple sell offers', async t => {
  t.plan(1);
  try {
    const {
      moolaIssuer,
      simoleanIssuer,
      moolaMint,
      simoleanMint,
      moola,
      simoleans,
      zoe,
    } = setup();
    const inviteIssuer = zoe.getInvitationIssuer();
    const installation = await installationPFromSource(zoe, simpleExchange);

    // Setup Alice
    const aliceMoolaPayment = moolaMint.mintPayment(moola(30));
    const aliceSimoleanPayment = simoleanMint.mintPayment(simoleans(30));
    const aliceMoolaPurse = moolaIssuer.makeEmptyPurse();
    const aliceSimoleanPurse = simoleanIssuer.makeEmptyPurse();
    await aliceMoolaPurse.deposit(aliceMoolaPayment);
    await aliceSimoleanPurse.deposit(aliceSimoleanPayment);

    // 1: Simon creates a simpleExchange instance and spreads the publicFacet
    // far and wide with instructions on how to use it.
    const {
      creatorInvitation: aliceInvite1,
      creatorFacet,
    } = await zoe.makeInstance(installation, {
      Asset: moolaIssuer,
      Price: simoleanIssuer,
    });

    const publicFacet = await creatorFacet.getPublicFacet();

    // 2: Alice escrows with zoe to create a sell order. She wants to
    // sell 3 moola and wants to receive at least 4 simoleans in
    // return.
    const aliceSale1OrderProposal = harden({
      give: { Asset: moola(3) },
      want: { Price: simoleans(4) },
      exit: { onDemand: null },
    });

    const alicePayments = { Asset: aliceMoolaPurse.withdraw(moola(3)) };
    // 4: Alice adds her sell order to the exchange
    const aliceSeat = await zoe.offer(
      aliceInvite1,
      aliceSale1OrderProposal,
      alicePayments,
    );

    // 5: Alice adds another sell order to the exchange
    const aliceInvite2 = await inviteIssuer.claim(
      await E(publicFacet).makeInvite(),
    );
    const aliceSale2OrderProposal = harden({
      give: { Asset: moola(5) },
      want: { Price: simoleans(8) },
      exit: { onDemand: null },
    });
    const proposal2 = {
      Asset: aliceMoolaPurse.withdraw(moola(5)),
    };
    const aliceSeat2 = await zoe.offer(
      aliceInvite2,
      aliceSale2OrderProposal,
      proposal2,
    );

    // 5: Alice adds a buy order to the exchange
    const aliceInvite3 = await inviteIssuer.claim(
      await E(publicFacet).makeInvite(),
    );
    const aliceBuyOrderProposal = harden({
      give: { Price: simoleans(18) },
      want: { Asset: moola(29) },
      exit: { onDemand: null },
    });
    const proposal3 = { Price: aliceSimoleanPurse.withdraw(simoleans(18)) };
    const aliceSeat3 = await zoe.offer(
      aliceInvite3,
      aliceBuyOrderProposal,
      proposal3,
    );

    await Promise.all([
      aliceSeat.getOfferResult(),
      aliceSeat2.getOfferResult(),
      aliceSeat3.getOfferResult(),
    ]).then(async () => {
      const expectedBook = {
        buys: [{ want: { Asset: moola(29) }, give: { Price: simoleans(18) } }],
        sells: [
          { want: { Price: simoleans(4) }, give: { Asset: moola(3) } },
          { want: { Price: simoleans(8) }, give: { Asset: moola(5) } },
        ],
      };
      t.deepEquals(
        (await E(E(publicFacet).getNotifier()).getUpdateSince()).value,
        expectedBook,
      );
    });
  } catch (e) {
    t.assert(false, e);
    console.log(e);
  }
});

test('simpleExchange with non-fungible assets', async t => {
  t.plan(9);
  const {
    ccIssuer,
    rpgIssuer,
    ccMint,
    rpgMint,
    cryptoCats,
    rpgItems,
    amountMaths,
    createRpgItem,
    zoe,
  } = setupNonFungible();
  const inviteIssuer = zoe.getInvitationIssuer();
  const installation = await installationPFromSource(zoe, simpleExchange);

  // Setup Alice
  const spell = createRpgItem('Spell of Binding', 'binding');
  const aliceRpgPayment = rpgMint.mintPayment(rpgItems(spell));
  const aliceRpgPurse = rpgIssuer.makeEmptyPurse();
  const aliceCcPurse = ccIssuer.makeEmptyPurse();

  // Setup Bob
  const bobCcPayment = ccMint.mintPayment(cryptoCats(harden(['Cheshire Cat'])));
  const bobRpgPurse = rpgIssuer.makeEmptyPurse();
  const bobCcPurse = ccIssuer.makeEmptyPurse();

  // 1: Simon creates a simpleExchange instance and spreads the invite far and
  // wide with instructions on how to use it.
  const {
    creatorInvitation: aliceInvite,
    creatorFacet,
  } = await zoe.makeInstance(installation, {
    Asset: rpgIssuer,
    Price: ccIssuer,
  });
  const publicFacet = await creatorFacet.getPublicFacet();

  // 2: Alice escrows with zoe to create a sell order. She wants to
  // sell a Spell of Binding and wants to receive CryptoCats in return.
  const aliceSellOrderProposal = harden({
    give: { Asset: rpgItems(spell) },
    want: { Price: cryptoCats(harden(['Cheshire Cat'])) },
    exit: { onDemand: null },
  });
  const alicePayments = { Asset: aliceRpgPayment };
  // 4: Alice adds her sell order to the exchange
  const aliceSeat = await zoe.offer(
    aliceInvite,
    aliceSellOrderProposal,
    alicePayments,
  );

  const bobInvite = await E(publicFacet).makeInvite();

  // 5: Bob decides to join.
  const {
    installation: bobInstallation,
    instance: bobInstance,
  } = await getInviteFields(inviteIssuer, bobInvite);
  const bobExclusiveInvite = await inviteIssuer.claim(bobInvite);

  t.equals(bobInstallation, installation);

  const bobIssuers = zoe.getIssuers(bobInstance);
  assert(
    bobIssuers.Asset === rpgIssuer,
    details`The Asset issuer should be the RPG issuer`,
  );
  assert(
    bobIssuers.Price === ccIssuer,
    details`The Price issuer should be the CryptoCat issuer`,
  );

  // Bob creates a buy order, saying that he wants the Spell of Binding,
  // and is willing to pay a Cheshire Cat.
  const bobBuyOrderProposal = harden({
    give: { Price: cryptoCats(harden(['Cheshire Cat'])) },
    want: { Asset: rpgItems(spell) },
    exit: { onDemand: null },
  });
  const bobPayments = { Price: bobCcPayment };

  // 6: Bob escrows with zoe
  // 8: Bob submits the buy order to the exchange
  const bobSeat = await zoe.offer(
    bobExclusiveInvite,
    bobBuyOrderProposal,
    bobPayments,
  );

  assertOfferResult(t, bobSeat, 'Trade Successful');
  assertOfferResult(t, aliceSeat, 'Trade Successful');

  const {
    Asset: bobRpgPayout,
    Price: bobCcPayout,
  } = await bobSeat.getPayouts();

  const {
    Asset: aliceRpgPayout,
    Price: aliceCcPayout,
  } = await aliceSeat.getPayouts();

  // Alice gets paid at least what she wanted
  t.ok(
    amountMaths
      .get('cc')
      .isGTE(
        await ccIssuer.getAmountOf(aliceCcPayout),
        aliceSellOrderProposal.want.Price,
      ),
  );

  // Alice sold the Spell
  t.deepEquals(
    await rpgIssuer.getAmountOf(aliceRpgPayout),
    rpgItems(harden([])),
  );

  // Assert that the correct payout were received.
  // Alice has an empty RPG purse, and the Cheshire Cat.
  // Bob has an empty CryptoCat purse, and the Spell of Binding he wanted.
  const noCats = amountMaths.get('cc').getEmpty();
  const noRpgItems = amountMaths.get('rpg').getEmpty();
  assertPayoutDeposit(t, aliceRpgPayout, aliceRpgPurse, noRpgItems);
  const cheshireCatAmount = cryptoCats(harden(['Cheshire Cat']));
  assertPayoutDeposit(t, aliceCcPayout, aliceCcPurse, cheshireCatAmount);
  assertPayoutDeposit(t, bobRpgPayout, bobRpgPurse, rpgItems(spell));
  assertPayoutDeposit(t, bobCcPayout, bobCcPurse, noCats);
});
