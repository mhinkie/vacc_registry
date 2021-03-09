// Initialization for Vaccination Registry

const vacc = require('../public/js/vaccination.js');

const VaccinationRegistry = artifacts.require("VaccinationRegistry");
const VaccinationRegistryImpl = artifacts.require("VaccinationRegistryImpl");

const DEFAULT_ADMIN_ROLE = "0x00";
const VACCINATOR_ROLE = web3.utils.keccak256("VACCINATOR_ROLE");
const OPERATOR_ROLE = web3.utils.keccak256("OPERATOR_ROLE");

const Dose = vacc.Dose;
// some doses for testing
const DOSES = [
  new Dose(Buffer.from("somedosesecret"), Buffer.from("12345"), "hep B"),
  new Dose(Buffer.from("secret"), Buffer.from("212111221"), "polio"),
  new Dose(Buffer.from("12312312"), Buffer.from("asdfasdfasdf"), "measles"),
  new Dose(Buffer.from("othersecret"), Buffer.from("8978465468"), "sometype")
];

// some key combinations for testing
// in the actual implementation these should be
// the private and public key of the ethereum address (or derived from it)

exports.patientKeys = {
  private: "8f11fceedfcb465db324e6bdc4e3b47e9d6821566da32c12964b36943754b3a5",
  public: "d9a4a9c7e830d32f99c373a2c65428140495be9b6275c6a5373eb2774c5f249722fe3ab61b315f0b7a61bef81cf66a18c81e37d6c4a6556ca2b71e7d7bcaabe0"
};
exports.thirdpartykeys = {
  private: "f8b9d11f995d11a788397c070639441555497fe70785fedf389758763cbd085c",
  public: "9940fca1624beb189a9540ead892d2357da303d4062d1ce1d5efb3b59aac33ad8a581b6978d2477c021a1b99ac9df70d0534a937cbf55fa785906476b3f22c98"
}

exports.initRegistry = async function(owner, operator, vaccinator, otherVaccinator, vaccregistry) {
  vaccregistry.grantRole(OPERATOR_ROLE, operator, {from:owner});
  vaccregistry.grantRole(VACCINATOR_ROLE, vaccinator, {from:operator});
  vaccregistry.grantRole(VACCINATOR_ROLE, otherVaccinator, {from:operator});

  // Add doses
  for(let dose of DOSES) {
    vaccregistry.addDose(dose.hash(), dose.typeIdentifier(), {from:operator});
  }
}

exports.VaccinationRegistry = VaccinationRegistry;
exports.VaccinationRegistryImpl = VaccinationRegistryImpl;
exports.DOSES = DOSES;
exports.ANNOUNCEMENT_LOCK_TIME = 3;

exports.B32ZERO = "0x0000000000000000000000000000000000000000000000000000000000000000";
exports.B32MAX = "0xFFFFFFFFFFFFFFFFFFFFFFFFFFFFFFFFFFFFFFFFFFFFFFFFFFFFFFFFFFFFFFFF";
exports.ADDRESS_0 = "0x0000000000000000000000000000000000000000";

exports.DEFAULT_ADMIN_ROLE = DEFAULT_ADMIN_ROLE
exports.VACCINATOR_ROLE = VACCINATOR_ROLE
exports.OPERATOR_ROLE = OPERATOR_ROLE
