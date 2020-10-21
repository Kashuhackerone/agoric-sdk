// @ts-check

import '../../../exported';

import { assertProposalShape, trade } from '../../contractSupport';

export const makeAddCollateralInvitation = (zcf, lenderSeat) => {
  const addCollateral = addCollateralSeat => {
    assertProposalShape(addCollateralSeat, {
      give: { Collateral: null },
      want: {},
      exit: { waived: null },
    });

    trade(
      zcf,
      {
        seat: lenderSeat,
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
