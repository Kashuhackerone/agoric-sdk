/**
 * @typedef LoanConfig
 * @property {number} mmr
 * @property {PriceOracle} priceOracle
 * @property {Autoswap} autoswap
 * @property {MakeBorrowInvitation} makeBorrowInvitation
 * @property {Liquidate} liquidate
 * @property {MakeCloseLoanInvitation} makeCloseLoanInvitation
 * @property {MakeAddCollateralInvitation} makeAddCollateralInvitation
 * @property {AsyncIterable} periodAsyncIterable
 * @property {number} interestRate
 *
 * The beginning configuration for a loan before a lender or
 * collateral has been added.
 */

/**
 * @typedef ConfigLender
 * @property {ZCFSeat} lenderSeat
 */

/**
 * @typedef ConfigBorrower
 * @property {ZCFSeat} lenderSeat
 * @property {ZCFSeat} collateralSeat
 * @property {() => Amount} getDebt
 * @property {Amount} liquidationTriggerValue The value of the
 * collateral in Loan brand terms, below which liquidation will be
 * triggered
 * @property {PromiseKit} liquidationPromiseKit PromiseKit that
 * includes a promise that resolves to a PriceQuote when liquidation
 * is triggered
 */

/**
 * @typedef {LoanConfig & ConfigLender} LoanConfigWithLender
 *
 * The loan has a lender.
 */

/**
 * @typedef {LoanConfig & ConfigBorrower } LoanConfigWithBorrower
 *
 * The loan has a lender and collateral.
 */

/**
 * @callback MakeLendInvitation
 * @param {ContractFacet} zcf
 * @param {LoanConfig} config
 * @returns {Promise<Invitation>} lendInvitation
 */

/**
 * @callback MakeBorrowInvitation
 * @param {ContractFacet} zcf
 * @param {LoanConfigWithLender} config
 * @returns {Promise<Invitation>} borrowInvitation
 */

/**
 * @callback MakeCloseLoanInvitation
 * @param {ContractFacet} zcf
 * @param {LoanConfigWithBorrower} config
 * @returns {Promise<Invitation>} closeLoanInvitation
 */

/**
 * Allows holder to add collateral to the contract. Exits the seat
 * after adding.
 *
 * @callback MakeAddCollateralInvitation
 * @param {ContractFacet} zcf
 * @param {LoanConfigWithBorrower} config
 * @returns {Promise<Invitation>} addCollateralInvitation
 */

/**
 * @callback Liquidate
 * @param {ContractFacet} zcf
 * @param {LoanConfigWithBorrower} config
 * @param {Amount} expectedValue
 * @returns {void}
 */

/**
 * @callback ScheduleLiquidation
 * @param {ContractFacet} zcf
 * @param {LoanConfigWithBorrower} config
 */

/**
 * @callback MakeDebtCalculator
 * @param {DebtCalculatorConfig} debtCalculatorConfig
 */

/**
 * @callback CalcInterestFn
 * @param {number} oldDebtValue
 * @param {number} interestRate
 * @returns {number} interest
 */

/**
 * @typedef {Object} DebtCalculatorConfig
 * @property {CalcInterestFn} calcInterestFn
 * @property {Amount} originalDebt
 * @property {AmountMath} debtMath
 * @property {AsyncIterable} periodAsyncIterable
 * @property {number} interestRate
 */

/**
 * @typedef {Object} BorrowFacet
 *
 * @property {() => Promise<Invitation>} makeCloseLoanInvitation
 *
 * Make an invitation to close the loan by repaying the debt
 *   (including interest).
 *
 * @property {() => Promise<Invitation>} makeAddCollateralInvitation
 *
 * Make an invitation to add collateral to protect against liquidation
 *
 * @property {() => Promise} getLiquidationPromise
 *
 * Get a promise that will resolve if liquidation occurs
 *
 * @property {() => Notifier<Amount>} getDebtNotifier
 *
 * Get notified when the current debt (an Amount in the Loan Brand) changes. This will
 * increase as interest is added.
 */
