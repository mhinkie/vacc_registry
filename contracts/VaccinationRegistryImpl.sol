pragma solidity ^0.6.1;

import "./VaccinationRegistry.sol";

struct PublicKey {
    bytes32 first;
    bytes32 last;
}

// Lock after announcement for upcoming vaccination
struct Lock {
    uint256 untilBlock;
    address owner;
}

struct UsedDose {
    bytes32 h;
    bytes encryptedType;
}

contract VaccinationRegistryImpl is VaccinationRegistry {
    
    // The mapping saving the public keys for each participant
    mapping (address => PublicKey) private publicKeys;
    // saves lock created during commitment
    mapping (bytes32 => Lock) private locks;
    // Saves identifier for each vaccine (=H(nonce, type)) - used for verifying vaccine type
    mapping (bytes32 => bytes32) private vaccineIdentifiers;
    // Saves the secret c for H(c) after it has been published during vaccination
    mapping (bytes32 => bytes) private secrets;
    // Saves the encrypted vaccinations for each person
    mapping (address => UsedDose[]) private vaccinations;
    
    
    // disclosedVaccinations[A][B][1] == the second vaccination A has disclosed for B
    mapping (address => mapping (address => UsedDose[])) private disclosedVaccinations;
    // to prevent flooding of vaccination information 
    // isDisclosed[A][B][_h] = true means that A disclosed _h for B already
    mapping (address => mapping (address => mapping (bytes32 => bool))) private isDisclosed;
    
    constructor() VaccinationRegistry() public {
        
    }
    
    // assumes 0 public keys can never happen
    function _isEmptyKey(PublicKey storage _key) internal view returns (bool) {
        return bytes32(0) == _key.first && bytes32(0) == _key.last;
    }
    
    function _isRegistered(address _person) internal override view returns (bool) {
        return !(_isEmptyKey(publicKeys[_person]));
    }
    
    /// @dev Registers `_person` with given public key.
    function _register(address _person, bytes32 _key_first, bytes32 _key_last) internal override {
        publicKeys[_person] = PublicKey(_key_first, _key_last);
    }
    
    /// @dev Returns the public key for `_person`
    function _getPublicKey(address _person) internal override view returns (bytes32 first, bytes32 last) {
        PublicKey storage key = publicKeys[_person];
        return (key.first, key.last);
    }
    
    /// @dev Announces that the vaccine-dose identified by `_h` will be applied in the next x blocks (see ANNOUNCEMENT_LOCK_TIME)
    function _announceVaccination(bytes32 _h, address _vaccinator) internal override {
        require(!isLocked(_h), "Dose is currently locked");
        require(_isDose(_h), "Not a valid dose hash");
        
        // Safemath not needed here: ANNOUNCEMENT_LOCK_TIME is an unsigned constant, block.number is unsigned and cannot be changed outside 
        locks[_h] = Lock(block.number + ANNOUNCEMENT_LOCK_TIME, _vaccinator);
    }
    
    /// @dev Returns the current lock on given vaccine-dose
    function _getLock(bytes32 _h) internal override view returns (uint256 untilBlock, address lockOwner) {
        Lock storage current = locks[_h];
        return (current.untilBlock, current.owner);
    }
    
    /// @dev Adds a dose identified by `_h`. 
    function _addDose(bytes32 _h, bytes32 _identifierHash) internal override {
        require(!_isDose(_h), "Dose identifier already exists");
        vaccineIdentifiers[_h] = _identifierHash;
    }
    
    /// @dev Returns the identifier hash H(n, vaccination_type) for given dose `_h`.
    function _getIdentifierHash(bytes32 _h) internal override view returns (bytes32) {
        return vaccineIdentifiers[_h];
    }
    
    /// @dev checks whether `_h` is a valid dose hash
    function _isDose(bytes32 _h) internal override view returns (bool) {
        return vaccineIdentifiers[_h] != bytes32(0);
    }
    
    /// @dev Publish vaccination information for _person.
    function _vaccinate(address _vaccinator, bytes32 _h, bytes memory _secret, address _person, bytes memory _encryptedType) internal override {
        require(secrets[_h].length == 0, "This dose is already used");
        
        // Although it would still be possible to perform the vaccination if there is no lock, 
        // I want to discourage doing this since then the secret could be "stolen" before the vaccination is performed
        require(isLocked(_h), "The dose is not locked");
        
        Lock storage l = locks[_h];
        require(l.owner == _vaccinator, "The sender does not own the lock for this dose");
        
        // Check if the secret actually matches 
        if(keccak256(_secret) != _h) {
            // Secret does not match: Vaccinator does not actually have the dose
            // Release lock 
            l.untilBlock = 0;
            return;
        }
        
        // Publish the secret 
        secrets[_h] = _secret;
        // Save vaccination 
        vaccinations[_person].push(UsedDose(_h, _encryptedType));
    }
    
    /// @dev returns the vaccination for msg.sender at index `_index`
    function _getVaccination(address _for, uint256 _index) internal override view returns (bytes32, bytes memory) {
        require(_index < vaccinations[_for].length);
        UsedDose storage d = vaccinations[_for][_index];
        return (d.h, d.encryptedType);
    }
    
    /// @dev returns the number of vaccinations for `_for`
    function _getNumberOfVaccinations(address _for) internal override view returns (uint256) {
        return vaccinations[_for].length;
    }
    
    function _discloseVaccination(address _from, bytes32 _h, bytes memory _encryptedType, uint256 _vIndex, address _recipient) internal override {
        // Check first if this is already disclosed
        require(!(isDisclosed[_from][_recipient][_h]), "Vaccination has already been disclosed");
        
        isDisclosed[_from][_recipient][_h] = true;
        
        // Check if this vaccination even belongs to the user 
        //vIndex is the index of this vaccination in the list of the user
        require(vaccinations[_from].length > _vIndex, "Vaccination index out of range");
        require(vaccinations[_from][_vIndex].h == _h, "Vaccination hash does not match");
        
        // Save the information
        disclosedVaccinations[_from][_recipient].push(UsedDose(_h, _encryptedType));
    }
    
    function _getNumberOfDisclosedVaccinations(address _for, address _from) internal override view returns (uint256) {
        return disclosedVaccinations[_from][_for].length;
    }
    
    function _getDisclosedVaccination(address _for, address _from, uint _index) internal override view returns (bytes32, bytes memory) {
        require(_index < disclosedVaccinations[_from][_for].length);
        UsedDose storage d = disclosedVaccinations[_from][_for][_index];
        return (d.h, d.encryptedType);
    }
    
}