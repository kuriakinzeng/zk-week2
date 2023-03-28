const hre = require('hardhat')
const { ethers, waffle } = hre
const { loadFixture } = waffle
const { expect } = require('chai')
const { utils, Wallet } = ethers

const Utxo = require('../src/utxo')
const { transaction, registerAndTransact, prepareTransaction, buildMerkleTree } = require('../src/index')
const { toFixedHex, poseidonHash } = require('../src/utils')
const { Keypair } = require('../src/keypair')
const { encodeDataForBridge } = require('./utils')

const MERKLE_TREE_HEIGHT = 5
const l1ChainId = 1
const MINIMUM_WITHDRAWAL_AMOUNT = utils.parseEther(process.env.MINIMUM_WITHDRAWAL_AMOUNT || '0.05')
const MAXIMUM_DEPOSIT_AMOUNT = utils.parseEther(process.env.MAXIMUM_DEPOSIT_AMOUNT || '1')

describe('Custom Tests', function () {
  this.timeout(20000)

  async function deploy(contractName, ...args) {
    const Factory = await ethers.getContractFactory(contractName)
    const instance = await Factory.deploy(...args)
    return instance.deployed()
  }

  async function fixture() {
    require('../scripts/compileHasher')
    const [sender, gov, l1Unwrapper, multisig] = await ethers.getSigners()
    const verifier2 = await deploy('Verifier2')
    const verifier16 = await deploy('Verifier16')
    const hasher = await deploy('Hasher')

    const token = await deploy('PermittableToken', 'Wrapped ETH', 'WETH', 18, l1ChainId)
    await token.mint(sender.address, utils.parseEther('10000'))

    const amb = await deploy('MockAMB', gov.address, l1ChainId)
    const omniBridge = await deploy('MockOmniBridge', amb.address)

    /** @type {TornadoPool} */
    const tornadoPoolImpl = await deploy(
      'TornadoPool',
      verifier2.address,
      verifier16.address,
      MERKLE_TREE_HEIGHT,
      hasher.address,
      token.address,
      omniBridge.address,
      l1Unwrapper.address,
      gov.address,
      l1ChainId,
      multisig.address,
    )

    const { data } = await tornadoPoolImpl.populateTransaction.initialize(
      MINIMUM_WITHDRAWAL_AMOUNT,
      MAXIMUM_DEPOSIT_AMOUNT,
    )
    const proxy = await deploy(
      'CrossChainUpgradeableProxy',
      tornadoPoolImpl.address,
      gov.address,
      data,
      amb.address,
      l1ChainId,
    )

    const tornadoPool = tornadoPoolImpl.attach(proxy.address)

    await token.approve(tornadoPool.address, utils.parseEther('10000'))

    return { tornadoPool, token, proxy, omniBridge, amb, gov, multisig }
  }

  it('[assignment] ii. deposit 0.1 ETH in L1 -> withdraw 0.08 ETH in L2 -> assert balances', async () => {
    // Alice deposits 0.1 ETH in L1 -> Alice withdraws 0.08 ETH in L2 -> assert recipient, omniBridge, and tornadoPool balances are correct
    const { tornadoPool, token, omniBridge } = await loadFixture(fixture)
    expect(await token.balanceOf(tornadoPool.address)).to.equal(0)
    expect(await token.balanceOf(omniBridge.address)).to.equal(0)

    // -- Alice deposits into the bridge in L1 --
    const aliceKeypair = new Keypair()
    const aliceDepositAmount = utils.parseEther('0.1')
    const aliceDepositUtxo = new Utxo({ amount: aliceDepositAmount, keypair: aliceKeypair })
    await token.transfer(omniBridge.address, aliceDepositAmount); // Transfer token to the bridge
    expect(await token.balanceOf(omniBridge.address)).to.equal(aliceDepositAmount) // Success! 
    expect(await token.balanceOf(tornadoPool.address)).to.equal(0)

    // -- Then we bridge the tokens to the pool in L2 and record the transaction by providing proof etc --   
    // Part 1: Set up tx to transfer tokens from bridge to the pool on L2
    const transferTx = await token.populateTransaction.transfer(tornadoPool.address, aliceDepositAmount);
    // Part 2: Set up tx to record the commitment / proof in the pool so that it can be withdrawn later
    const { args, extData } = await prepareTransaction({ tornadoPool, outputs: [aliceDepositUtxo]}) // get proof of transaction
    const onTokenBridgedData = encodeDataForBridge({ proof: args, extData }) // encoded proof
    const onTokenBridgedTx = await tornadoPool.populateTransaction.onTokenBridged( token.address, aliceDepositUtxo.amount, onTokenBridgedData ) 
    // Execute the two functions above
    await omniBridge.execute([
      { who: token.address, callData: transferTx.data }, // send tokens to pool
      { who: tornadoPool.address, callData: onTokenBridgedTx.data } // call onTokenBridgedTx
    ])
    expect(await token.balanceOf(omniBridge.address)).to.equal(0) 
    expect(await token.balanceOf(tornadoPool.address)).to.equal(aliceDepositAmount) // Tokens are bridged from L1 to L2 (Tornado Pool)!

    // -- Alice withdraws from the pool in L2 --
    const aliceWithdrawAmount = utils.parseEther('0.08')
    const recipient = '0xDeaD00000000000000000000000000000000BEEf' // aliceKeypair.address() should have returned alice's address but it didn't so we use a random address instead
    const aliceChangeUtxo = new Utxo({
      amount: aliceDepositAmount.sub(aliceWithdrawAmount),
      keypair: aliceKeypair // because of the keypair, the pool can associate the commitment to Alice and allow her to withdraw regardless of the recipient address
    })
    await transaction({
      tornadoPool,
      inputs: [aliceDepositUtxo],
      outputs: [aliceChangeUtxo],
      recipient: recipient,
      isL1Withdrawal: false
    })
    const recipientBalance = await token.balanceOf(recipient)
    expect(recipientBalance).to.be.equal(aliceWithdrawAmount)
    const omniBridgeBalance = await token.balanceOf(omniBridge.address)
    expect(omniBridgeBalance).to.be.equal(0)
    const tornadoPoolBalance = await token.balanceOf(tornadoPool.address)
    expect(tornadoPoolBalance).to.be.equal(aliceDepositAmount.sub(aliceWithdrawAmount))
  })

  it('[assignment] iii. see assignment doc for details', async () => {
    // [assignment] complete code here
    const { tornadoPool, token, omniBridge } = await loadFixture(fixture)
    expect(await token.balanceOf(tornadoPool.address)).to.equal(0)
    expect(await token.balanceOf(omniBridge.address)).to.equal(0)

    // Alice deposits 0.13 ETH in L1 
    const aliceKeypair = new Keypair()
    const aliceDepositAmount = utils.parseEther('0.13')
    const aliceDepositUtxo = new Utxo({
      amount: aliceDepositAmount, 
      keypair: aliceKeypair
    })
    await token.transfer(omniBridge.address, aliceDepositAmount)
    expect(await token.balanceOf(tornadoPool.address)).to.equal(0)
    expect(await token.balanceOf(omniBridge.address)).to.equal(aliceDepositAmount)

    // Bridge from L1 to L2
    // 1. Set up a token transfer tx
    const transferTx = await token.populateTransaction.transfer(tornadoPool.address, aliceDepositAmount)
    // 2. Set up the commitment tx
    const { args, extData } = await prepareTransaction({tornadoPool, outputs: [aliceDepositUtxo]})
    const onTokenBridgedData = encodeDataForBridge({proof: args, extData})
    const onTokenBridgedTx = await tornadoPool.populateTransaction.onTokenBridged( token.address, aliceDepositUtxo.amount, onTokenBridgedData ) 
    await omniBridge.execute([
      {who: token.address, callData: transferTx.data},
      {who: tornadoPool.address, callData: onTokenBridgedTx.data }
    ])
    expect(await token.balanceOf(omniBridge.address)).to.equal(0) 
    expect(await token.balanceOf(tornadoPool.address)).to.equal(aliceDepositAmount)

    // Alice sends 0.06 ETH to Bob in L2
    const aliceTfBobAmount = utils.parseEther('0.06')
    const aliceTfBobUtxo = new Utxo({
      amount: aliceDepositAmount.sub(aliceTfBobAmount),
      keypair: aliceKeypair
    })
    const bobKeypair = new Keypair();
    const bobAddress = bobKeypair.address(); // this is a shielded address
    const bobReceiveUtxo = new Utxo({
      amount: aliceTfBobAmount,
      keypair: bobKeypair
    })
    await transaction({
      tornadoPool,
      inputs: [aliceDepositUtxo],
      outputs: [aliceTfBobUtxo, bobReceiveUtxo],
    })

    // Bob withdraws all his funds in L2 
    // Utxo describes the end state
    const bobWithdrawUtxo = new Utxo({
      amount: 0,
      keypair: bobKeypair
    })
    const bobEthAddress = Wallet.createRandom().address
    await transaction({
      tornadoPool,
      inputs: [bobReceiveUtxo],
      outputs: [bobWithdrawUtxo],
      recipient: bobEthAddress
    })

    const bobBalance = await token.balanceOf(bobEthAddress)
    expect(bobBalance).to.be.equal(aliceTfBobAmount)
    const omniBridgeBalance = await token.balanceOf(omniBridge.address)
    expect(omniBridgeBalance).to.be.equal(0)
    const tornadoPoolBalance = await token.balanceOf(tornadoPool.address)
    expect(tornadoPoolBalance).to.be.equal(aliceDepositAmount.sub(aliceTfBobAmount))

    // Alice withdraws all her remaining funds in L1
    const aliceWithdrawUtxo = new Utxo({
      amount: 0,
      keypair: aliceKeypair
    })
    const aliceEthAddress = Wallet.createRandom().address
    await transaction({
      tornadoPool,
      inputs: [aliceTfBobUtxo],
      outputs: [aliceWithdrawUtxo],
      recipient: aliceEthAddress,
      isL1Withdrawal: true // some magic here 
    })
    // assert all relevant balances are correct
    const aliceBalance = await token.balanceOf(aliceEthAddress)
    expect(aliceBalance).to.be.equal(0)
  })
})
