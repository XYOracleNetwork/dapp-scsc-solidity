import { BigNumber } from "bignumber.js"

const ERC20 = artifacts.require(`XyERC20Token.sol`)
const Governance = artifacts.require(`XyGovernance.sol`)
const PLCR = artifacts.require(`PLCRVoting.sol`)
const erc20TotalSupply = 1000000
const fs = require(`fs`)
const config = JSON.parse(fs.readFileSync(`./config/testParams.json`))
const params = config.paramDefaults

const parameters = [
  params.pMinDeposit,
  params.pApplyStageSec,
  params.pCommitStageSec,
  params.pRevealStageSec,
  params.pDispensationPct,
  params.pVoteSuccessRate,
  params.pVoteQuorum,
  params.xyStakeSuccessPct,
  params.xyWeiMiningMin,
  params.xyXYORequestBountyMin,
  params.xyStakeCooldown,
  params.xyUnstakeCooldown,
  params.xyProposalsEnabled,
  params.xyBlockProducerRewardPct
]
require(`chai`)
  .use(require(`chai-as-promised`))
  .use(require(`chai-bignumber`)(BigNumber))
  .should()

contract(
  `XyGovernance`,
  ([
    governanceOwner,
    governanceResolver,
    erc20owner,
    plcrOwner
  ]) => {
    let erc20
    let governance
    let plcr
    before(async () => {
      erc20 = await ERC20.new(erc20TotalSupply, `XYO Token`, `XYO`, {
        from: erc20owner
      })
      plcr = await PLCR.new({
        from: plcrOwner
      })
      await plcr.initialize(erc20.address)
    })
    beforeEach(async () => {
      governance = await Governance.new({
        from: governanceOwner
      })
      await governance.initialize(erc20.address,
        plcr.address,
        parameters, { from: governanceOwner })
      await governance.initializeGovernor(governanceResolver)
    })
    describe(`Proposing an action`, () => {
      it(`should allow proposing a new action when minDeposit is 0`, async () => {
        await governance.proposeNewAction(`0x28a8746e75304c0780e011bed21c72cd78cd535e`, 50, 0).should.be.fulfilled
        const hasAction = await governance.hasUnresolvedAction(`0x28a8746e75304c0780e011bed21c72cd78cd535e`)
        hasAction.should.be.equal(true)
      })
      it(`should not allow proposing a new action on stakee if one is in progress`, async () => {
        await governance.proposeNewAction(`0x28a8746e75304c0780e011bed21c72cd78cd535e`, 50, 0).should.be.fulfilled
        await governance.proposeNewAction(`0x123`, 50, 0).should.not.be.fulfilled
      })
      it(`should allow proposing a new action on seperate stakee if one is in progress`, async () => {
        await governance.proposeNewAction(`0x28a8746e75304c0780e011bed21c72cd78cd535e`, 50, 0).should.be.fulfilled
        await governance.proposeNewAction(`0x3e5e9111ae8eb78fe1cc3bb8915d5d461f3ef9a9`, 50, 0).should.be.fulfilled
      })
    })
    describe(`owner setting`, () => {
      it(`should allow setting by owner and only owner`, async () => {
        await governance.ownerSet(`Hi`, 123, { from: governanceOwner }).should.be.fulfilled
        await governance.ownerSet(`Hi`, 123, { from: plcrOwner }).should.not.be.fulfilled
      })
      it(`should not allow setting by owner after renouncing ownership`, async () => {
        await governance.ownerSet(`Hi`, 123, { from: governanceOwner }).should.be.fulfilled
        await governance.renounceOwnership({ from: governanceOwner }).should.be.fulfilled
        await governance.ownerSet(`Hi1`, 123, { from: governanceOwner }).should.not.be.fulfilled
      })
      it(`owner should set and get stuff`, async () => {
        await governance.ownerSet(`Hi`, 123, { from: governanceOwner }).should.be.fulfilled
        const what = await governance.get(`Hi`, { from: governanceOwner })
        what.toNumber().should.be.equal(123)
        await governance.ownerSet(`Hi`, 123444, { from: governanceOwner })
        const what1 = await governance.get(`Hi`, { from: governanceOwner })
        what1.toNumber().should.be.equal(123444)
      })
    })
    describe(`resolving actions`, () => {
      const stakee = `0x28a8746e75304c0780e011bed21c72cd78cd535e`
      const stakee1 = `0x3e5e9111ae8eb78fe1cc3bb8915d5d461f3ef9a9`
      const stakee2 = `0x90f8bf6a479f320ead074411a4b0e7944ea8c9c1`
      beforeEach(async () => {
        await governance.proposeNewAction(stakee, 50, 0).should.be.fulfilled
        await governance.proposeNewAction(stakee1, 50, 1).should.be.fulfilled
        await governance.ownerSet(`xyGovernanceAction`, stakee)
        await governance.ownerSet(`xyGovernanceAction`, stakee1)
      })
      it(`should allow resolving by resolver`, async () => {
        await governance.resolveAction(stakee, { from: governanceOwner }).should.not.be.fulfilled
        await governance.resolveAction(stakee1, { from: governanceResolver }).should.be.fulfilled
        await governance.resolveAction(stakee, { from: governanceResolver }).should.be.fulfilled
      })
      it(`should allow resolving only once`, async () => {
        await governance.resolveAction(stakee, { from: governanceResolver }).should.be.fulfilled
        await governance.resolveAction(stakee, { from: governanceResolver }).should.not.be.fulfilled
      })
      it(`should return correct value for hasUnresolvedAction once resolved`, async () => {
        const unresolved1 = await governance.hasUnresolvedAction(stakee)
        const unresolved2 = await governance.hasUnresolvedAction(stakee1)
        unresolved1.should.be.equal(true)
        unresolved2.should.be.equal(true)
        await governance.resolveAction(stakee, { from: governanceResolver }).should.be.fulfilled
        await governance.resolveAction(stakee1, { from: governanceResolver }).should.be.fulfilled
        const unresolved1New = await governance.hasUnresolvedAction(stakee)
        const unresolved2New = await governance.hasUnresolvedAction(stakee1)
        unresolved1New.should.be.equal(false)
        unresolved2New.should.be.equal(false)
      })
      it(`should increment resolutions when resolved`, async () => {
        const unresolved1 = await governance.numResolutions(stakee)
        const unresolved2 = await governance.numResolutions(stakee1)
        unresolved1.toNumber().should.be.equal(0)
        unresolved2.toNumber().should.be.equal(0)
        await governance.resolveAction(stakee, { from: governanceResolver }).should.be.fulfilled
        await governance.resolveAction(stakee1, { from: governanceResolver }).should.be.fulfilled
        const unresolved1New = await governance.numResolutions(stakee)
        const unresolved2New = await governance.numResolutions(stakee1)
        unresolved1New.toNumber().should.be.equal(1)
        unresolved2New.toNumber().should.be.equal(1)
      })
      it(`should not allow setting governance action never proposed`, async () => {
        await governance.ownerSet(`xyGovernanceAction`, stakee2).should.not.be.fulfilled
        await governance.resolveAction(stakee2, { from: governanceResolver }).should.not.be.fulfilled
      })
    })
  }
)
