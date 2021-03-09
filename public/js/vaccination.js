
//Functions for encoding/encrypting/decrypting vaccination information

var cw = require('./cryptoWrapper.js');;

class RegistryConnection {
  constructor(registry, me) {
    this.me = me;

    this.registry = registry;
    console.log(`Created registry connection at ${this.registry.address} for ${me}`);
  }

  // Operator adds a newly created dose to the registry
  async addDose(dose) {
    await this.registry.addDose(dose.hash(), dose.typeIdentifier(), {from:this.me});
  }

  // Verify that given dose information actually matches the
  // information stored on chain
  // Examples: vaccinator reads information from newly aquired dose
  // returns Dose object in case verification succeeds
  // Throws exception with exact error otherwise
  // secret and nonce are expected to be base64 encoded
  async verifyDose(secret, nonce, type) {
    let dose = new Dose(Buffer.from(secret, 'base64'), Buffer.from(nonce, 'base64'), type);

    let doseHash = dose.hash();
    let typeIdentifier = dose.typeIdentifier();

    // Check if there actually is a dose with this identifier (verifies secret)
    if(!(await this.registry.isDose(doseHash, {from:this.me}))) {
      throw "No dose with this hash found!";
    }

    // Check if the dose type matches the type stored on chain
    let storedTypeHash = await this.registry.getIdentifierHash(dose.hash());
    if(storedTypeHash != typeIdentifier) {
      throw `Type of dose can not be verified with registry!
        - stored: ${storedTypeHash}, expected: ${typeIdentifier}`;
    }

    // Everything OK - return Dose
    return dose;
  }

  async getKeyFor(patient) {
    let isRegistered = await this.registry.isRegistered(patient, {from:this.me});
    if(isRegistered) {
      let key = await this.registry.getPublicKey(patient, {from:this.me});
      return key[0].slice(2) + key[1].slice(2);
    } else {
      throw "Person is not registered";
    }
  }

  async register(public_key) {
    let key_first = "0x" + public_key.slice(0, 64);
    let key_last = "0x" + public_key.slice(64);
    await this.registry.register(key_first, key_last, {from:this.me});
  }

  async getNumberOfVaccinations() {
    return this.registry.getNumberOfVaccinations({from:this.me});
  }

  async getNumberOfDisclosedVaccinations(disclosedBy) {
    return this.registry.getNumberOfDisclosedVaccinations(disclosedBy, {from:this.me});
  }

  async discloseVaccination(hash, dose, index, to) {
    // Get key for third party
    if(!(await this.registry.isRegistered(to))) {
      throw "Person not found in the registry";
    }
    let key = await this.getKeyFor(to);

    //console.log("disclosed plaintext: " + dose.ptIdentifier());
    // Encrypt identifier
    let eid = await cw.encrypt(key, dose.ptIdentifier());
    //console.log("disclosed encrypted: " + eid);

    // Publish disclosed dose
    let estimate = await this.registry.discloseVaccination.estimateGas(
      hash,
      "0x" + eid,
      index,
      to,
      {from: this.me}
    );
    await this.registry.discloseVaccination.sendTransaction(
      hash,
      "0x" + eid,
      index,
      to,
      {from: this.me, gas:estimate}
    );
  }

  async verifyDisclosedVaccination(privateKey, disclosedBy, index) {
    let vacc = await this.registry.getDisclosedVaccination(disclosedBy, index, {from:this.me});

    return this.verifyVaccinationInformation(privateKey, vacc);
  }

  async verifyVaccinationInformation(privateKey, vacc) {
    let hash = vacc[0];
    let storedIdentifier = await this.registry.getIdentifierHash(hash);

    //console.log("stored encrypted: " + vacc[1].slice(2));
    let decryptedInfo = await cw.decrypt(privateKey, vacc[1].slice(2));
    //console.log("stored plaintext: " + decryptedInfo);

    let splitter = decryptedInfo.indexOf("#");
    let nonce = decryptedInfo.slice(0,splitter);
    let type = decryptedInfo.slice(splitter+1);

    let dose = new Dose(0, nonce, type);
    if(dose.typeIdentifier() != storedIdentifier) {
      //console.log("Description error. Expected: " + dose.typeIdentifier() + ", Actual: " + storedIdentifier);
      throw "Dose description does not match stored description!"
    }

    console.log("Verified " + type);
    return {hash:hash, dose:dose};;
  }

  async verifyVaccination(privateKey, index) {
    //console.log(`Verifying vaccination: ${index}`);

    let vacc = await this.registry.getVaccination(index, {from:this.me});
    return this.verifyVaccinationInformation(privateKey, vacc);
  }

  // Vaccinate a person
  async vaccinate(dose, patient) {
    // get key for the patient
    if(!(await this.registry.isRegistered(patient))) {
      throw "Patient not found in the registry";
    }
    let key = await this.getKeyFor(patient);

    // check if the dose is actually what i want to vaccinate
    let typeHash = await this.registry.getIdentifierHash(dose.hash());
    if(dose.typeIdentifier() != typeHash) {
      throw "Stored dose does not match given dose";
    }

    // Try to announce my vaccination
    await this.registry.announceVaccination(dose.hash(), {from:this.me});
    //console.log("managed to announce my vaccination");

    // Double check if the lock is actually mine (so I dont accidentally leak the secret)
    if(!(await this.registry.isLocked(dose.hash(), {from:this.me}))) {
      throw "Locking the dose was not successful (no lock found)";
    }
    let lock = await this.registry.getLock(dose.hash(), {from:this.me});
    if(lock[1].toLowerCase() != this.me.toLowerCase()) {
      throw "Locking the dose was not successful (someone else own the lock after locking)";
    }

    //console.log("managed to check announcement");

    // Encrypt identifier
    let eid = await cw.encrypt(key, dose.ptIdentifier());
    //console.log("Saved encrypted identifier");
    //console.log(eid);

    // Vaccinate
    let estimation = await this.registry.vaccinate.estimateGas(
      dose.hash(),
      dose.formatSecret(),
      patient,
      "0x" + eid,
      {from:this.me}
    );
    //console.log("Vaccination call will cost: " + estimation);
    await this.registry.vaccinate.sendTransaction(
      dose.hash(),
      dose.formatSecret(),
      patient,
      "0x" + eid,
      {from:this.me, gas:estimation}
    );

    //console.log("managed to vaccinate");
  }
}

class Dose {
  constructor(secret, nonce, type) {
    this.secret = secret;
    this.nonce = nonce;
    this.type = type;
  }

  // formats secret for use in solidity call
  formatSecret() {
    return "0x" + this.secret.toString('hex')
  }

  hash() {
    return cw.hashfunction(this.secret);
  }

  ptIdentifier() {
    return this.nonce.toString('base64') + "#" + this.type;
  }

  typeIdentifier() {
    return cw.hashfunction(this.ptIdentifier());
  }

  // Returns the information to be printed on the dose
  getPrintInformation() {
    return {s:this.secret.toString('base64'),n:this.nonce.toString('base64')};
  }
}

// Secret and nonce will be base64 encoded to so they can easily printed
// as QR codes for example and exchanged with the vaccine
// length of the secret in bytes
const SECRET_SIZE = 32;
// length of the nonce in bytes
const NONCE_SIZE = 32;

// Creates a dose of a given vaccine using a random nonce and a random secret
// The dose will be shared along with base64 encoded secrets
// If the dose is processed the secrets are read from base64 into Buffer again
function createDose(type) {
  let secret = cw.createRandomArray(SECRET_SIZE);
  let nonce = cw.createRandomArray(NONCE_SIZE);
  return new Dose(secret, nonce, type);
}

exports.Dose = Dose;
exports.createDose = createDose;
exports.SECRET_SIZE = SECRET_SIZE;
exports.NONCE_SIZE = NONCE_SIZE;
exports.RegistryConnection = RegistryConnection;
exports.Buffer = Buffer; // export buffer so it can be used in browser

// Everyting to expose from cryptowrapper
exports.cw = {
  getPublicKey: cw.getPublicKey
}
