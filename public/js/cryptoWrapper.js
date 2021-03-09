// Wrapper for cryptography (in case the used libraries should change)

var ethcrypto = require('eth-crypto');;
var crypto = require('crypto');;


function createRandomArray(sizeInBytes) {
  return crypto.randomBytes(sizeInBytes);
}

function web3Keccak(value) {
  if(value instanceof Buffer) {
    return web3.utils.keccak256("0x" + value.toString('hex'));
  }
  if(web3.utils.isHexStrict(value)) {
    // is already hex string starting with 0x
    return web3.utils.keccak256(value);
  } else {
    if(web3.utils.isHex(value)) {
      // Is already is hex but without 0x
      return web3.utils.keccak256("0x" + value);
    } else {
      return web3.utils.keccak256(web3.utils.toHex(value));
    }
  }
}

// expectes private with or without 0x
// returns public key for private key
function getPublicKeyEth(privateKey) {
  return ethcrypto.publicKeyByPrivateKey(privateKey);
}

// switch implementations here if necessary
exports.createRandomArray = createRandomArray;
exports.hashfunction = web3Keccak;
exports.getPublicKey = getPublicKeyEth;
exports.encrypt = async(publicKey, message) => ethcrypto.cipher.stringify(await ethcrypto.encryptWithPublicKey(publicKey, message));
exports.decrypt = async(privateKey, message) => ethcrypto.decryptWithPrivateKey(privateKey, await ethcrypto.cipher.parse(message));
