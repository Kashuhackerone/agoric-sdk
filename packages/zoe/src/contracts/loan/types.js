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
