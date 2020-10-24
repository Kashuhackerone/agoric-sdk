// @ts-check

import '../../../exported';

import { assertProposalShape, trade } from '../../contractSupport';

// Create an invitation to add collateral to the loan. Part of the
// facet given to the borrower.

/** @type {MakeAddCollateralInvitation} */
export const makeAddCollateralInvitation = (zcf, config) => {
  const { collateralSeat } = config;

  /** @type {OfferHandler} */
  const addCollateral = addCollateralSeat => {
    assertProposalShape(addCollateralSeat, {
      give: { Collateral: null },
      want: {},
    });

    trade(
      zcf,
      {
        seat: collateralSeat,
        gains: {
          Collateral: addCollateralSeat.getAmountAllocated('Collateral'),
        },
      },
      {
        seat: addCollateralSeat,
        gains: {},
      },
    );
    addCollateralSeat.exit();
    return 'a warm fuzzy feeling that you are further away from default than ever before';
  };

  return zcf.makeInvitation(addCollateral, 'addCollateral');
};
