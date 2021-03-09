const truffleAssert = require('truffle-assertions');

const common = require('./Helper.js');
const vacc = require('../public/js/vaccination.js');

const TEST_PK = [
  web3.utils.keccak256("A"),
  web3.utils.keccak256("B"),
  web3.utils.keccak256("C"),
  web3.utils.keccak256("D"),
];

contract("VaccinationRegistry test", async accounts => {
  let vaccregistry;

  let owner = accounts[0];
  let operator = accounts[1];
  let vaccinator = accounts[2];
  let patient = accounts[3];
  let otherPatient = accounts[4];
  let otherVaccinator = accounts[5];

  beforeEach("deploy and init", async () => {
    vaccregistry = await common.VaccinationRegistryImpl.new({from:owner});
    await common.initRegistry(owner, operator, vaccinator, otherVaccinator, vaccregistry);
  });

  it("Default admin should be set", async() => {
    assert(await vaccregistry.hasRole(common.DEFAULT_ADMIN_ROLE, owner));
  });

  it("Valid registrations should be recorded", async() => {
    await vaccregistry.register(TEST_PK[0], TEST_PK[1], {from:patient});
    assert(await vaccregistry.isRegistered(patient));
  });

  it("Re-registrations by ordinary user should revert", async() => {
    await vaccregistry.register(TEST_PK[0], TEST_PK[1], {from:patient});
    await truffleAssert.reverts(vaccregistry.register(TEST_PK[2], TEST_PK[3], {from:patient}));
  });

  it("Valid registrations should have associated public key", async() => {
    await vaccregistry.register(TEST_PK[0], TEST_PK[1], {from:patient});

    let pk = await vaccregistry.getPublicKey(patient, {from:vaccinator});
    assert.equal(pk[0], TEST_PK[0]);
    assert.equal(pk[1], TEST_PK[1]);
  });

  it("Operators can register third parties", async() => {
    assert(!(await vaccregistry.isRegistered(patient)));
    await vaccregistry.registerOther(patient, TEST_PK[0], TEST_PK[1], {from:operator});
    assert(await vaccregistry.isRegistered(patient));

    let pk = await vaccregistry.getPublicKey(patient, {from:operator});
    assert.equal(pk[0], TEST_PK[0]);
    assert.equal(pk[1], TEST_PK[1]);
  });

  it("Others cannot register third parties", async() => {
    await truffleAssert.reverts(vaccregistry.registerOther(otherPatient, TEST_PK[2], TEST_PK[3], {from:patient}));
  });

  it("Operators can re-register users", async() => {
    await vaccregistry.register(TEST_PK[0], TEST_PK[1], {from:patient});
    assert(await vaccregistry.isRegistered(patient));

    await vaccregistry.registerOther(patient, TEST_PK[2], TEST_PK[3], {from:operator});
    let pk = await vaccregistry.getPublicKey(patient, {from:operator});
    assert.equal(pk[0], TEST_PK[2]);
    assert.equal(pk[1], TEST_PK[3]);

  });

  it("Operators can add doses", async() => {
    await vaccregistry.addDose(
      web3.utils.keccak256("asdf"), web3.utils.keccak256("id"), {from:operator});
    assert(await vaccregistry.isDose(web3.utils.keccak256("asdf")));
  });

  it("Others cannot add doses", async() => {
    await truffleAssert.reverts(vaccregistry.
      addDose(web3.utils.keccak256("asdf"), web3.utils.keccak256("id"), {from:patient}));
    await truffleAssert.reverts(vaccregistry.
      addDose(web3.utils.keccak256("asdf"), web3.utils.keccak256("id"), {from:vaccinator}));

  })

  it("Added doses should be present", async() => {
    assert(await vaccregistry.isDose(common.DOSES[0].hash()));
  });

  it("Invalid doses should have 0 identifier hash", async() => {
    let invalidHash = web3.utils.keccak256("notpresent");
    assert(!(await vaccregistry.isDose(invalidHash)));

    let idHash = await vaccregistry.getIdentifierHash(invalidHash);
    assert.equal(idHash, common.B32ZERO);
  });

  it("Adding already present dose should revert", async() => {
    assert(vaccregistry.isDose(common.DOSES[0].hash()));
    await truffleAssert.reverts(vaccregistry.
      addDose(common.DOSES[0].hash(), common.DOSES[0].typeIdentifier(), {from:operator}));
  });

  it("Vaccinators can announce vaccinations for valid doses", async() => {
    await vaccregistry.announceVaccination(common.DOSES[0].hash(), {from:vaccinator});
  });

  it("Others cannot announce vaccinations", async() => {
    await truffleAssert.reverts(
      vaccregistry.announceVaccination(common.DOSES[0].hash(), {from:patient}));
    await truffleAssert.reverts(
      vaccregistry.announceVaccination(common.DOSES[0].hash(), {from:operator}));
  });

  it("Only valid doses should be able to be announced", async() => {
    await truffleAssert.reverts(
      vaccregistry.announceVaccination(web3.utils.keccak256("invaliddose"), {from:vaccinator}));
  });

  it("Announced vaccinations should be locked", async() => {
    await vaccregistry.announceVaccination(common.DOSES[0].hash(), {from:vaccinator});
    assert(await vaccregistry.isLocked(common.DOSES[0].hash(), {from:vaccinator}));
  });

  it("Invalid doses should not be locked", async() => {
    assert(!(await vaccregistry.isLocked(web3.utils.keccak256("invaliddose"), {from:vaccinator})));
  })

  it("Unanounced doses should not be locked", async() => {
    assert(!(await vaccregistry.isLocked(common.DOSES[0].hash(), {from:vaccinator})));
  });

  it("Locks for unanounced common.DOSES should be until 0 and for address(0)", async() => {
    let lock = await vaccregistry.getLock(common.DOSES[0].hash(), {from:vaccinator});
    assert.equal(lock[0], web3.utils.hexToNumberString(common.B32ZERO));
    assert.equal(lock[1], common.ADDRESS_0);
  });

  it("Locks for announcements should be held by vaccinator", async() => {
    await vaccregistry.announceVaccination(common.DOSES[0].hash(), {from:vaccinator});
    let lock = await vaccregistry.getLock(common.DOSES[0].hash(), {from:vaccinator});
    assert.equal(lock[1], vaccinator);
  })

  it("Locks for announcements should be valid until block + ANNOUNCEMENT_LOCK_TIME", async() => {
    let tx = await vaccregistry.announceVaccination(common.DOSES[0].hash(), {from:vaccinator});
    let blocknum = tx.receipt.blockNumber;
    let lock = await vaccregistry.getLock(common.DOSES[0].hash(), {from:vaccinator});
    assert.equal(lock[0], blocknum + common.ANNOUNCEMENT_LOCK_TIME);
  })

  it("Announced vaccinations should be unlocked after ANNOUNCEMENT_LOCK_TIME", async() => {
    await vaccregistry.announceVaccination(common.DOSES[0].hash(), {from:vaccinator});
    assert(await vaccregistry.isLocked(common.DOSES[0].hash(), {from:otherVaccinator}));
    await truffleAssert.reverts(vaccregistry.announceVaccination(common.DOSES[0].hash(), {from:vaccinator}));
    //console.log(await web3.eth.getBlockNumber());
    // mine blocks
    for(let i=0;i<common.ANNOUNCEMENT_LOCK_TIME+1;i++) {
      await web3.currentProvider.send({
        jsonrpc: "2.0",
        method: "evm_mine",
        id: i
      }, function(err, result) {});
    }
    //console.log(await web3.eth.getBlockNumber());

    assert(!(await vaccregistry.isLocked(common.DOSES[0].hash(), {from:otherVaccinator})));
    // Should not fail now
    await vaccregistry.announceVaccination(common.DOSES[0].hash(), {from:otherVaccinator});
  });

  it("Announced vaccinations can be performed", async() => {
    await vaccregistry.announceVaccination(common.DOSES[0].hash(), {from:vaccinator});
    await vaccregistry.vaccinate(
      common.DOSES[0].hash(),
      common.DOSES[0].formatSecret(),
      patient,
      "0x123123123",
      {from:vaccinator}
    );
  });

  it("Valid vaccination should be readable", async() => {
    let numberBefore = await vaccregistry.getNumberOfVaccinations({from:patient});

    await vaccregistry.announceVaccination(common.DOSES[0].hash(), {from:vaccinator});
    await vaccregistry.vaccinate(
      common.DOSES[0].hash(),
      common.DOSES[0].formatSecret(),
      patient,
      "0x123123123",
      {from:vaccinator}
    );

    let numberAfter = await vaccregistry.getNumberOfVaccinations({from:patient});

    assert(numberAfter > numberBefore);

    let vacc = await vaccregistry.getVaccination(numberAfter-1, {from:patient})
    assert.equal(vacc[1], "0x0123123123");
  });

  it("Only vaccinators can perform vaccinations", async() => {
    await vaccregistry.announceVaccination(common.DOSES[0].hash(), {from:vaccinator});
    // vaccinate(bytes32 _h, bytes calldata _secret, address _person, bytes calldata _encryptedType)
    await truffleAssert.reverts(vaccregistry.vaccinate(
      common.DOSES[0].hash(),
      common.DOSES[0].formatSecret(),
      otherPatient,
      "0x12312312312",
      {from:operator}
    ));
  });

  it("Performing unanounced vaccinations should revert", async() => {
    await truffleAssert.reverts(vaccregistry.vaccinate(
      common.DOSES[0].hash(),
      common.DOSES[0].formatSecret(),
      patient,
      "0x123123123",
      {from:vaccinator}
    ));
  });

  it("Only original announcer can perform vaccination", async() => {
    await vaccregistry.announceVaccination(common.DOSES[0].hash(), {from:vaccinator});
    await truffleAssert.reverts(vaccregistry.vaccinate(
      common.DOSES[0].hash(),
      common.DOSES[0].formatSecret(),
      patient,
      "0x123123123",
      {from:otherVaccinator}
    ));
  });

  it("Performing vaccination with invalid secret should not be recorded", async() => {
    let numberBefore = await vaccregistry.getNumberOfVaccinations({from:patient});

    await vaccregistry.announceVaccination(common.DOSES[0].hash(), {from:vaccinator});
    await vaccregistry.vaccinate(
      common.DOSES[0].hash(),
      common.DOSES[1].formatSecret(), // take secret from other dose
      patient,
      "0x123123123",
      {from:vaccinator}
    );

    assert(numberBefore.toString(),
      (await vaccregistry.getNumberOfVaccinations({from:patient})).toString());
  });

  it("Performing vaccination with invalid secret should release lock", async() => {
    await vaccregistry.announceVaccination(common.DOSES[0].hash(), {from:vaccinator});
    let lockBefore = await vaccregistry.getLock(common.DOSES[0].hash(), {from:vaccinator});
    await vaccregistry.vaccinate(
      common.DOSES[0].hash(),
      common.DOSES[1].formatSecret(), // take secret from other dose
      patient,
      "0x123123123",
      {from:vaccinator}
    );

    assert(lockBefore[0] != 0)

    let lock = await vaccregistry.getLock(common.DOSES[0].hash(), {from:vaccinator});
    assert.equal(lock[0], 0);
  });

  it("Vaccination performed by invalid vaccinator should not release lock", async() => {
    await vaccregistry.announceVaccination(common.DOSES[0].hash(), {from:vaccinator});
    let lockBefore = await vaccregistry.getLock(common.DOSES[0].hash(), {from:vaccinator});

    await truffleAssert.reverts(vaccregistry.vaccinate(
      common.DOSES[0].hash(),
      common.DOSES[0].formatSecret(),
      patient,
      "0x123123123",
      {from:otherVaccinator}
    ));

    let lockAfter = await vaccregistry.getLock(common.DOSES[0].hash(), {from:vaccinator});

    assert.equal(lockBefore[0].toString(), lockAfter[0].toString());
    assert.equal(lockBefore[1], lockAfter[1]);
  });

  it("Performing two vaccinations with the same dose should revert", async() => {
    await vaccregistry.announceVaccination(common.DOSES[0].hash(), {from:vaccinator});
    await vaccregistry.vaccinate(
      common.DOSES[0].hash(),
      common.DOSES[0].formatSecret(),
      patient,
      "0x123123123",
      {from:vaccinator}
    );
    await truffleAssert.reverts(
      vaccregistry.vaccinate(
        common.DOSES[0].hash(),
        common.DOSES[0].formatSecret(),
        patient,
        "0x123123123",
        {from:vaccinator}
      )
    );
  });

  it("Disclosed Vaccination will be saved", async() => {

    // Perform a vaccination
    await vaccregistry.announceVaccination(common.DOSES[0].hash(), {from:vaccinator});
    await vaccregistry.vaccinate(
      common.DOSES[0].hash(),
      common.DOSES[0].formatSecret(),
      patient,
      "0x123123123",
      {from:vaccinator}
    );

    // patient can now disclose this vaccination to otherPatient
    // (bytes32 _h, bytes calldata _encryptedType, uint256 _vIndex, address _recipient)
    await vaccregistry.discloseVaccination(
      common.DOSES[0].hash(),
      "0xAB12315", // Type is now encrypted with public key of otherPatient
      0,
      otherPatient,
      {from:patient}
    );

    // This information should now be readable by otherpatient
    let readVaccNumber = await vaccregistry.getNumberOfDisclosedVaccinations(
      patient,
      {from:otherPatient}
    );

    assert(readVaccNumber > 0);

    let readVacc = await vaccregistry.getDisclosedVaccination(
      patient,
      readVaccNumber-1,
      {from:otherPatient}
    );

    assert.equal(readVacc[0], common.DOSES[0].hash());
    assert.equal(readVacc[1], "0x0ab12315");

    // Others should not be able to read it
    await truffleAssert.reverts(
      vaccregistry.getDisclosedVaccination(
        patient,
        readVaccNumber-1,
        {from:otherVaccinator}
      )
    );
  })

});
