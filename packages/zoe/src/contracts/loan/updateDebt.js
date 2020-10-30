// @ts-check

import '../../../exported';

import { E } from '@agoric/eventual-send';
import { natSafeMath } from '../../contractSupport';

// Update the debt by adding the new interest on every period, as
// indicated by the periodAsyncIterable

const BASIS_POINT_DENOMINATOR = 10000;

/**
 * @type {CalcInterestFn} Calculate the interest using an interest
 * rate in basis points.
 * i.e. oldDebtValue is 40,000
 * interestRate (in basis points) is 5 = 5/10,000
 * interest charged this period is 20 loan brand
 */
export const calculateInterest = (oldDebtValue, interestRate) =>
  natSafeMath.floorDivide(
    natSafeMath.multiply(oldDebtValue, interestRate),
    BASIS_POINT_DENOMINATOR,
  );

/** @type {MakeDebtCalculator} */
export const makeDebtCalculator = debtCalculatorConfig => {
  const {
    calcInterestFn = calculateInterest,
    originalDebt,
    debtMath,
    periodPromise,
    interestRate,
  } = debtCalculatorConfig;
  let debt = originalDebt;

  const updateDebt = newPeriodPromise => {
    const interest = debtMath.make(calcInterestFn(debt.value, interestRate));
    debt = debtMath.add(debt, interest);

    // Debt will continue to get updated for as long as the
    // periodPromise resolves to a newPeriodPromise
    E(newPeriodPromise).then(updateDebt);
  };

  // Register the initial update of the debt.
  E(periodPromise).then(updateDebt);

  return harden({
    getDebt: () => debt,
  });
};
