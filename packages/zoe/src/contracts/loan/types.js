/**
 * @typedef LoanConfig
 * @property {number} mmr
 * @property {PriceOracle} priceOracle
 * @property {Autoswap} autoswap
 * @property {MakeBorrowInvitation} makeBorrowInvitation
 * @property {Liquidate} liquidate
 * @property {MakeCloseLoanInvitation} makeCloseLoanInvitation
 * @property {MakeAddCollateralInvitation} makeAddCollateralInvitation
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
