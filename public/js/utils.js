// Wraps a web3 1.2. contract object (of vaccinationregistry)
// in a object similar to truffles contracts (based on web3 0.2)
// because I realized way too late that those differ and I dont
// want to change the tests and implementation of RegistryConnection now
// Want to "translate" a call like
// a.addDose(dose.hash(), dose.typeIdentifier(), {from:this.me});
// into
// b.methods.addDose(dose.hash(), dose.typeIdentifier()).send({from:this.me})
// someone with more knowledge about JS might have an easier solutions than this...
class RegistryWrapper {
  constructor(registryWeb3) {
    this.w3reg = registryWeb3;
    this.address = this.w3reg.options.address;

    this.vaccinate = {};
    this.vaccinate.estimateGas = async function(h,s,p,m,opts) {
      return registryWeb3.methods.vaccinate(h,s,p,m).estimateGas(opts);
    };
    this.vaccinate.sendTransaction = async function(h,s,p,m,opts) {
      return registryWeb3.methods.vaccinate(h,s,p,m).send(opts);
    };

    this.discloseVaccination = {};
    this.discloseVaccination.estimateGas = async function(h,e,i,r,o) {
      return registryWeb3.methods.discloseVaccination(h,e,i,r).estimateGas(o);
    };
    this.discloseVaccination.sendTransaction = async function(h,e,i,r,o) {
      return registryWeb3.methods.discloseVaccination(h,e,i,r).send(o);
    };
  }
  // tx functions
  async addDose(h,i,f) { return this.w3reg.methods.addDose(h,i).send(f); }
  async register(kf,kl,f) { return this.w3reg.methods.register(kf,kl).send(f); }
  async announceVaccination(h,f) { return this.w3reg.methods.announceVaccination(h).send(f); }
  async grantRole(t,a,f) { return this.w3reg.methods.grantRole(t,a).send(f); }
  // view functions
  async getIdentifierHash(h) { return this.w3reg.methods.getIdentifierHash(h).call(); }
  async isDose(h,f) { return this.w3reg.methods.isDose(h).call(f); }
  async getPublicKey(p,f) { return this.w3reg.methods.getPublicKey(p).call(f); }
  async getNumberOfVaccinations(f) { return this.w3reg.methods.getNumberOfVaccinations().call(f); }
  async getVaccination(i,f) { return this.w3reg.methods.getVaccination(i).call(f); }
  async isRegistered(p) { return this.w3reg.methods.isRegistered(p).call(); }
  async isLocked(h,f) { return this.w3reg.methods.isLocked(h).call(); }
  async getLock(h,f) { return this.w3reg.methods.getLock(h).call(f); }

  async getNumberOfDisclosedVaccinations(f,o) { return this.w3reg.methods.getNumberOfDisclosedVaccinations(f).call(o); }
  async getDisclosedVaccination(f,i,o) { return this.w3reg.methods.getDisclosedVaccination(f,i).call(o); }
}

// Adds a loading animation (= disabling the button and adding spinner)
// Returns a function that, when called, will stop the animation
// Can be used for processes that have to wait for blocks to be mined
function addLoadingAnimation(button) {
  var loadingHtml = `
    <span class="loadAnim spinner-border spinner-border-sm" role="status" aria-hidden="true"></span>
    <span class="loadAnim sr-only">Loading...</span>
  `;
  // Check if this button is already loading:
  if(button.find('.loadAnim').length === 0) {
    // Disable button
    button.prop("disabled",true);
    // Add loadingHtml as first child
    button.prepend(loadingHtml);

    return (function() {
      //console.log("Removing loading anim");
      button.prop("disabled", false);
      button.find('.loadAnim').remove();
    });
  } else {
    // Will not return a function that removes the animation created elsewhere
    // => return empty function
    return (function() {})
  }
}

$.urlParam = function(name){
    var results = new RegExp('[\?&]' + name + '=([^&#]*)').exec(window.location.href);
    if (results==null){
        return null;
    }
    else{
        return decodeURI(results[1]) || 0;
    }
};

function handleObjects(key, value) {
  // Properly handle buffers in json output
  // https://stackoverflow.com/questions/34557889/how-to-deserialize-a-nested-buffer-using-json-parse
  if(value !== null
    && typeof value === 'object'
    && 'type' in value
    && value.type === 'Buffer'
    && 'data' in value
    && Array.isArray(value.data)) {
      //console.log("handling buffer");
      // Looks like a buffer
      return window.vaccination.Buffer.from(value.data);
  }
  // Properly handle doses
  if(value !== null
    && typeof value === 'object'
    && 'nonce' in value
    && 'secret' in value
    && 'type' in value) {
      //console.log("handling dose");
      return new window.vaccination.Dose(value.secret, value.nonce, value.type);
  }

  return value;
}

function updateUrlParameter(uri, key, value) {
    // remove the hash part before operating on the uri
    var i = uri.indexOf('#');
    var hash = i === -1 ? ''  : uri.substr(i);
    uri = i === -1 ? uri : uri.substr(0, i);

    var re = new RegExp("([?&])" + key + "=.*?(&|$)", "i");
    var separator = uri.indexOf('?') !== -1 ? "&" : "?";
    if (uri.match(re)) {
        uri = uri.replace(re, '$1' + key + "=" + value + '$2');
    } else {
        uri = uri + separator + key + "=" + value;
    }
    return uri + hash;  // finally append the hash as well
}


Handlebars.getTemplate = function(name) {
    if (Handlebars.templates === undefined || Handlebars.templates[name] === undefined) {
        $.ajax({
            url : 'templates/' + name + '.html',
            success : function(data) {
                if (Handlebars.templates === undefined) {
                    Handlebars.templates = {};
                }
                Handlebars.templates[name] = Handlebars.compile(data);
            },
            async : false
        });
    }
    return Handlebars.templates[name];
};
