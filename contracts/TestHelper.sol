pragma solidity ^0.6.1;

// Contract used only for testing
contract TestHelper {
    // Used to check if the externally used hashfunction behaves like solidity's keccak256
    function hash(bytes calldata _input) external pure returns (bytes32) {
        return keccak256(_input);
    }
} 