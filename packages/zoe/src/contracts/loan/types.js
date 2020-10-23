/**
 * @callback MakeLendInvitation
 * @param {ContractFacet} zcf
 * @param {MakeBorrowInvitation} makeBorrowInvitation
 * @param {number} mmr Margin Maintenance Requirement, in percent.
 * Must be greater than 100
 * @param {priceWakeup} priceOracle
 * @returns {Promise<Invitation>} lendInvitation
 */

/**
 * @callback MakeBorrowInvitation
 * @param {ContractFacet} zcf
 * @param {ZcfSeat} lenderSeat
 * @param {number} mmr Margin Maintenance Requirement, in percent.
 * Must be greater than 100
 * @param {priceWakeup} priceOracle
 * @param {any} autoswap
 * @returns {Promise<Invitation>} borrowInvitation
 */

/**
 * @callback MakeCloseLoanInvitation
 * @param {ContractFacet} zcf
 * @param {ZcfSeat} collSeat
 * @param {ZcfSeat} lenderSeat
 * @param {() => Amount} getBorrowedAmount
 * @param {() => Interest } getInterest
 */

/**
 * Allows holder to add collateral to the contract. Exits the seat
 * after adding.
 *
 * @callback MakeAddCollateralInvitation
 * @param {ContractFacet} zcf
 * @param {ZCFSeat} collSeat
 */
