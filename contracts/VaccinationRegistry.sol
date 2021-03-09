pragma solidity ^0.6.1;

import "@openzeppelin/contracts/access/AccessControl.sol";
import "@openzeppelin/contracts/access/Ownable.sol";

abstract contract VaccinationRegistry is AccessControl {
    /// @dev Operators are allowed to add/remove vaccinators as well as add new vaccine doses.
    bytes32 public constant OPERATOR_ROLE = keccak256("OPERATOR_ROLE");
    /// @dev Roles for medical professionals administering vaccines.
    bytes32 public constant VACCINATOR_ROLE = keccak256("VACCINATOR_ROLE");
    /// @dev After announcing the application of a specific vaccine-dose the information regarding this dose will be locked for ANNOUNCEMENT_LOCK_TIME blocks.
    uint256 public constant ANNOUNCEMENT_LOCK_TIME = 3;


    constructor() public {
        _setupRole(DEFAULT_ADMIN_ROLE, msg.sender);
        _setRoleAdmin(VACCINATOR_ROLE, OPERATOR_ROLE);
    }

    modifier onlyVaccinatorOrOperator() {
        require(hasRole(OPERATOR_ROLE, msg.sender) || hasRole(VACCINATOR_ROLE, msg.sender), "Sender is no vaccinator or operator");
        _;
    }

    modifier onlyOperator() {
        require(hasRole(OPERATOR_ROLE, msg.sender), "Sender is no operator");
        _;
    }

    modifier onlyVaccinator() {
        require(hasRole(VACCINATOR_ROLE, msg.sender), "Sender is no vaccinator");
        _;
    }

    /// @dev Registers `_person` with given public key.
    function _register(address _person, bytes32 _key_first, bytes32 _key_last) internal virtual;

    /// @dev Returns the public key for `_person`
    function _getPublicKey(address _person) internal virtual view returns (bytes32 first, bytes32 last);

    /// @dev Announces that the vaccine-dose identified by `_h` will be applied in the next x blocks (see ANNOUNCEMENT_LOCK_TIME)
    function _announceVaccination(bytes32 _h, address _vaccinator) internal virtual;

    /// @dev Check if `_person` is registered.
    function _isRegistered(address _person) internal virtual view returns (bool);

    /// @dev Returns the current lock on given vaccine-dose (if not locked: (0, address(0))
    function _getLock(bytes32 _h) internal virtual view returns (uint256 untilBlock, address lockOwner);

    /// @dev Adds a dose identified by `_h`.
    function _addDose(bytes32 _h, bytes32 _identifierHash) internal virtual;

    /// @dev Returns the identifier hash H(n, vaccination_type) for given dose `_h`.
    function _getIdentifierHash(bytes32 _h) internal virtual view returns (bytes32);

    /// @dev checks whether `_h` is a valid dose hash
    function _isDose(bytes32 _h) internal virtual view returns (bool);

    /// @dev Publish vaccination information for _person.
    function _vaccinate(address _vaccinator, bytes32 _h, bytes memory _secret, address _person, bytes memory _encryptedType) internal virtual;

    /// @dev returns the vaccination for msg.sender at index `_index`
    function _getVaccination(address _for, uint256 _index) internal virtual view returns (bytes32, bytes memory);

    /// @dev returns the number of vaccinations for `_for`
    function _getNumberOfVaccinations(address _for) internal virtual view returns (uint256);

    function _discloseVaccination(address _from, bytes32 _h, bytes memory _encryptedType, uint256 _vIndex, address _recipient) internal virtual;

    function _getNumberOfDisclosedVaccinations(address _for, address _from) internal virtual view returns (uint256);

    function _getDisclosedVaccination(address _for, address _from, uint _index) internal virtual view returns (bytes32, bytes memory);


    /// @notice Registers the sender with the given public key
    /// @param _key_first first 32 bytes of the key
    /// @param _key_last last 32 bytes of the key
    function register(bytes32 _key_first, bytes32 _key_last) external {
        require(!(_isRegistered(msg.sender)), "Address already registered");
        _register(msg.sender, _key_first, _key_last);
    }

    /// @notice Registers `_person` in the registry using the given public key.
    /// @dev Only for operators.
    /// @param _person the person to register.
    /// @param _key_first first 32 bytes of the key
    /// @param _key_last last 32 bytes of the key
    function registerOther(address _person, bytes32 _key_first, bytes32 _key_last) onlyOperator external {
        _register(_person, _key_first, _key_last);
    }

    /// @notice Read the public key of `_person`.
    /// @param _person whos key to read.
    /// @return first first 32 bytes of the key
    /// @return last last 32 bytes of the key
    function getPublicKey(address _person) external view returns (bytes32 first, bytes32 last) {
        return _getPublicKey(_person);
    }

    /// @notice Check if `_person` is registered.
    /// @return true if registered, false otherwise
    function isRegistered(address _person) external view returns (bool) {
        return _isRegistered(_person);
    }

    /// @notice Announces that the vaccine-dose identified by `_h` will be applied in the next x blocks (see ANNOUNCEMENT_LOCK_TIME)
    /// @dev Only for vaccinators.
    /// @param _h the hash identifying the vaccine-dose.
    function announceVaccination(bytes32 _h) onlyVaccinator external  {
        _announceVaccination(_h, msg.sender);
    }

    /// @notice Returns the current lock on given vaccine-dose. If a lock is inactive but still is the last lock on this dose it will be returned aswell.
    /// @param _h the hash identifying the vaccine-dose
    /// @return untilBlock the block number until this dose is locked, or 0 if not locked
    /// @return lockOwner address of the owner of this lock or address(0) if not locked
    function getLock(bytes32 _h) onlyVaccinatorOrOperator external view returns (uint256 untilBlock, address lockOwner) {
        return _getLock(_h);
    }

    /// @dev returns whether the dose `_h` is locked.
    function isLocked(bytes32 _h) onlyVaccinatorOrOperator public view returns (bool) {
        (uint untilBlock, ) = _getLock(_h);
        return block.number <= untilBlock;
    }

    /// @notice Adds a dose identified by `_h`. The given hash H(n, vaccination_type) will be used by the patient after the dose has been used
    /// to verify that the correct vaccine information was supplied by the vaccinator.
    function addDose(bytes32 _h, bytes32 _identifierHash) onlyOperator external {
        _addDose(_h, _identifierHash);
    }

    /// @notice Returns the identifier hash H(n, vaccination_type) for given dose `_h`.
    function getIdentifierHash(bytes32 _h) external view returns (bytes32) {
        return _getIdentifierHash(_h);
    }

    /// @notice Check whether `_h` is a valid dose hash.
    function isDose(bytes32 _h) external view returns (bool) {
        return _isDose(_h);
    }

    /// @notice Publish vaccination information for `_person`.
    /// @dev Fails and releases lock if H(_secret) does not match _h (=vaccinator didnt actually know the secret).
    /// Fails without releasing lock if msg.sender does not match the lock owner of _h (someone else wants to use _h).
    /// If the function fails and releases the lock it will not revert (since the release of the lock has to be saved),
    /// but the vaccination will not be recorded
    /// @param _h the hash H(c) of the secret
    /// @param _secret the secret c to verify that the dose is in posession of msg.sender
    /// @param _person the person to be vaccinated
    /// @param _encryptedType the type of the vaccination (with nonce) encrypted so only _person can read it = (PK_P(n, vaccination_type))
    function vaccinate(bytes32 _h, bytes calldata _secret, address _person, bytes calldata _encryptedType) onlyVaccinator external  {
        _vaccinate(msg.sender, _h, _secret, _person, _encryptedType);
    }

    /// @notice returns the vaccination for msg.sender at index `_index`
    function getVaccination(uint256 _index) external view returns (bytes32, bytes memory) {
        return _getVaccination(msg.sender, _index);
    }

    /// @notice returns the number of vaccinations for `_for`
    function getNumberOfVaccinations() external view returns (uint256) {
        return _getNumberOfVaccinations(msg.sender);
    }

    /// @notice Disclose vaccination status to a third party.
    function discloseVaccination(bytes32 _h, bytes calldata _encryptedType, uint256 _vIndex, address _recipient) external {
        _discloseVaccination(msg.sender, _h, _encryptedType, _vIndex, _recipient);
    }

    /// @notice returns the number of vaccinations shared by _from for you.
    function getNumberOfDisclosedVaccinations(address _from) external view returns (uint256) {
        return _getNumberOfDisclosedVaccinations(msg.sender, _from);
    }

    /// @notice returns the disclosed vaccination information shared with index `_index`
    function getDisclosedVaccination(address _from, uint _index) external view returns (bytes32, bytes memory) {
        return _getDisclosedVaccination(msg.sender, _from, _index);
    }
}
