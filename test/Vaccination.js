// Tests off-chain crypto for hiding vaccination information


const common = require('./Helper.js');
const vacc = require('../public/js/vaccination.js');
const cw = require('../public/js/cryptoWrapper.js');

const TestHelper = artifacts.require("TestHelper");

contract("Vaccination test", async accounts => {
  let vaccregistry;
  let testhelper;

  let owner = accounts[0];
  let operator = accounts[1];
  let vaccinator = accounts[2];
  let patient = accounts[3];
  let otherPatient = accounts[4];
  let otherVaccinator = accounts[5];

  beforeEach("deploy and init", async () => {
    vaccregistry = await common.VaccinationRegistryImpl.new({from:owner});
    testhelper = await TestHelper.new();
    await common.initRegistry(owner, operator, vaccinator, otherVaccinator, vaccregistry);
  });

  it("Dose hashes for different secrets should (usually) differ", async() => {
    assert.notEqual(common.DOSES[0].hash(), common.DOSES[1].hash());
  });

  it("Dose hashes for the same doses should be equal", async() => {
    assert.equal(common.DOSES[2].hash(), common.DOSES[2].hash());
  });

  it("Newly created doses should differ", async() => {
    let dose1 = vacc.createDose("measles");
    let dose2 = vacc.createDose("measles");
    assert.notEqual(dose1.hash(), dose2.hash());
    // type identifiers should differ aswell, otherwise it it possible to
    // search all vaccination-doses with a given type on chain and infer
    // who has been vaccinated with this vaccine
    assert.notEqual(dose1.typeIdentifier(), dose2.typeIdentifier());
  });

  it("Type identifier of dose should match with dose read from contract", async() => {
    // Create a new dose
    let dose = vacc.createDose("hep B");

    // Save dose in contract
    await vaccregistry.addDose(dose.hash(), dose.typeIdentifier(), {from:operator});

    // Read type identifier from contract
    let idHash = await vaccregistry.getIdentifierHash(dose.hash());

    assert.equal(idHash, dose.typeIdentifier());
  });

  it("Aquired doses can be correctly processed", async() => {
    // Scenario: Operator provides new doses and adds them to the contract
    // Ships doses including encoded secret and nonce to distributor
    // Vaccinator buys doses and can properly verify that the secret and type
    // actually match the information in the contract

    // Operator
    let operatorConnection = new vacc.RegistryConnection(vaccregistry, operator);

    let d = vacc.createDose("hep B");
    await operatorConnection.addDose(d);

    // Base 64 secret and nonce are printed on the dose (QR code or similar)
    let printed = d.getPrintInformation();
    //console.log(printed);

    // Vaccinator reads dose information
    let secret = printed.s;
    let nonce = printed.n;
    // Vaccinator knows this is a hep B vaccine (its on the box...)
    let type = "hep B";

    let vaccinatorConnection = new vacc.RegistryConnection(vaccregistry, vaccinator);
    let dv = await vaccinatorConnection.verifyDose(secret, nonce, type); // Should not fail

    assert.equal(dv.secret.toString('hex'), d.secret.toString('hex'));
    assert.equal(dv.nonce.toString('hex'), d.nonce.toString('hex'));
    assert.equal(dv.type.toString('hex'), d.type.toString('hex'));
  });

  it("Test public key calculation", async() => {
    // Given a private key, expects getPublicKey to return a key which can be used
    // to decrypt messages encrypted with private key and the other way around
    let private = common.patientKeys.private;
    let public = cw.getPublicKey(private);

    assert.equal(public, common.patientKeys.public);
  });

  it("Test encrypt/decrypt", async() => {
    let message = "hallohallo";

    let cipher = await cw.encrypt(common.patientKeys.public, message);
    let plaintext = await cw.decrypt(common.patientKeys.private, cipher);

    assert.equal(plaintext, message);
  });

  it("Hash function behaves like solidity's hash function for strings", async() => {
    let strings = [
      cw.createRandomArray(vacc.SECRET_SIZE),
      cw.createRandomArray(vacc.SECRET_SIZE),
      cw.createRandomArray(vacc.SECRET_SIZE),
      cw.createRandomArray(vacc.SECRET_SIZE)
    ];

    for(let v of strings) {
      let ext = cw.hashfunction(v);
      let sol = await testhelper.hash("0x" + v.toString('hex'));
      assert.equal(ext, sol);
    }
  });

  it("Patients can self-register", async() => {
    let vaccinatorConnection = new vacc.RegistryConnection(vaccregistry, vaccinator);
    let patientConnection = new vacc.RegistryConnection(vaccregistry, patient);

    await patientConnection.register("d9a4a9c7e830d32f99c373a2c65428140495be9b6275c6a5373eb2774c5f249722fe3ab61b315f0b7a61bef81cf66a18c81e37d6c4a6556ca2b71e7d7bcaabe0");

    let stored_key = await vaccinatorConnection.getKeyFor(patient);
    assert.equal(stored_key, "d9a4a9c7e830d32f99c373a2c65428140495be9b6275c6a5373eb2774c5f249722fe3ab61b315f0b7a61bef81cf66a18c81e37d6c4a6556ca2b71e7d7bcaabe0");

  });

  it("Valid dose can be vaccinated", async() => {
    let vaccinatorConnection = new vacc.RegistryConnection(vaccregistry, vaccinator);
    let patientConnection = new vacc.RegistryConnection(vaccregistry, patient);

    await patientConnection.register(common.patientKeys.public);

    await vaccinatorConnection.vaccinate(common.DOSES[0], patient);
  });

  it("Vaccinated dose can be verified", async() => {
    // Vaccinate
    let vaccinatorConnection = new vacc.RegistryConnection(vaccregistry, vaccinator);
    let patientConnection = new vacc.RegistryConnection(vaccregistry, patient);

    await patientConnection.register(common.patientKeys.public);

    await vaccinatorConnection.vaccinate(common.DOSES[0], patient);

    let status = await patientConnection.verifyVaccination(
      common.patientKeys.private,
      (await patientConnection.getNumberOfVaccinations())-1
    );

    assert.equal(status.hash, common.DOSES[0].hash());
    assert.equal(status.dose.type, common.DOSES[0].type);
  });

  it("Disclosed vaccinations can be verified", async() => {
    // Vaccinate someone
    let vaccinatorConnection = new vacc.RegistryConnection(vaccregistry, vaccinator);
    let patientConnection = new vacc.RegistryConnection(vaccregistry, patient);

    await patientConnection.register(common.patientKeys.public);

    await vaccinatorConnection.vaccinate(common.DOSES[0], patient);

    let vaccinfo = await patientConnection.verifyVaccination(
      common.patientKeys.private,
      (await patientConnection.getNumberOfVaccinations())-1
    );

    // register third party
    let tpConnection = new vacc.RegistryConnection(vaccregistry, otherPatient);
    await tpConnection.register(common.thirdpartykeys.public);

    // should be vaccinated at index 0
    // disclosed vaccination
    await patientConnection.discloseVaccination(vaccinfo.hash, vaccinfo.dose, 0, otherPatient);

    // otherpatient should be able to verify this vaccination
    let vvacc = await tpConnection.verifyDisclosedVaccination(
      common.thirdpartykeys.private,
      patient,
      0
    );

    console.log(vvacc);
  });
});
