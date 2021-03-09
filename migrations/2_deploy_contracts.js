const VaccinationRegistryImpl = artifacts.require("VaccinationRegistryImpl");

module.exports = function(deployer) {
  deployer.deploy(VaccinationRegistryImpl);
};
