function setupPerson() {
  var template = Handlebars.getTemplate('person-template');
  var personDoseTemplate = Handlebars.getTemplate('items/person-dose-template');
  var tHtml = template({});
  $('#main').html(tHtml);
  var privateKeyPresent = false;
  var registered = false;

  function checkRegisterStatus() {
    // Checks if the person is registered
    asSoonAsConnectionChecked(() => {
      if(setupComplete) {
        //console.log("Checking register status");
        // Disable register button for now
        let remover = addLoadingAnimation($("#registerBtn"));
        registryConnection.getKeyFor(registryConnection.me)
          .then((publicKey) => {
            // Got a public key - am registered
            remover();
            setRegistered(publicKey);
          })
          .catch((error) => {
            // Got no public key - not registered
            // Do nothing - person can register later
            console.log(error);
              remover();
          });
      }
    });
  }

  // Shows that the person is registered
  function setRegistered(publicKey) {
    registered = true;
    $('#ownPublicKey').val(publicKey);
    $('#registerStatus').text('Registered');
    $('#registerStatus').removeClass('bg-danger');
    $('#registerStatus').addClass('bg-success');
    $('#registerBtn').prop('disabled', true);
  }


  $('#createNewKeyBtn').click(function() {
    // Uses web3 accounts create to generate private key
    let privateKey = web3.eth.accounts.create().privateKey.slice(2); // Remove 0x
    //console.log(`Private key: ${privateKey}`);

    // notify listeners
    $('#privateKey').val(privateKey).trigger("change");
  });

  $('#registerBtn').click(function() {
    // Derive public key from private key and register
    let privateKey = $('#privateKey').val();
    // In this version it should be hex 32 byte (= 64 characters)
    if(!web3.utils.isHex(privateKey) || privateKey.length != 64) {
      $('#privateKey').addClass('is-invalid');
    } else {
      $('#privateKey').removeClass('is-invalid');
      if(setupComplete) {
        // Derive public key
        let publicKey = window.vaccination.cw.getPublicKey(privateKey);

        // Show we are doing stuff
        let remover = addLoadingAnimation($(this));

        // register
        registryConnection.register(publicKey)
          .then(() => {
            setRegistered(publicKey);
          })
          .catch((error) => {
            displayError(error);
          })
          .finally(() => {
            // Remove loading animation
            remover();
          });

      } else {
        notConnected();
      }
    }
  });

  $('#privateKey').change(function() {
    if($(this).val() !== "") {
      privateKeyPresent = true;
      if(registered) {
        $('#refreshVaccButton').prop('disabled', false);
      }
    } else {
      privateKeyPresent = false;
      $('#refreshVaccButton').prop('disabled', true);
    }
  });

  function verifyVacc(privateKey, index) {
    //console.log("starting verification of " + index);
    // Add empty dose
    var emptyDoseHtml = $(personDoseTemplate({
      index:index,
      verifying: true,
      type: "Verifying",
      nonce: ""
    })).filter('.cardcol');
    emptyDoseHtml.appendTo($('#itemlist'));

    // Start verification
    registryConnection.verifyVaccination(privateKey, index)
      .then((doseinfo) => {
        //console.log("Successful verification");
        //console.log(doseinfo.dose.type);
        //console.log(doseinfo.dose.nonce);
        let successEnv = {
          hash: doseinfo.hash,
          index:index,
          verified: true,
          type: doseinfo.dose.type,
          nonce: doseinfo.dose.nonce.slice(0,10) + "...",
          fullNonce: doseinfo.dose.nonce
        }
        emptyDoseHtml.replaceWith(personDoseTemplate(successEnv));
      })
      .catch((error) => {
        // Replace with error dose
        let errorEnv = {
          index:index,
          error: true,
          type: "Error",
          nonce: error
        };
        emptyDoseHtml.replaceWith(personDoseTemplate(errorEnv));
      });
  }

  function verifyDisclosedVaccination(privateKey, disclosedBy, index) {

    var emptyDoseHtml = $(personDoseTemplate({
      readonly:true,
      index:index,
      verifying: true,
      type: "Verifying",
      nonce: ""
    })).filter('.cardcol');
    emptyDoseHtml.appendTo($('#sharedlist'));


    registryConnection.verifyDisclosedVaccination(privateKey, disclosedBy, index)
      .then((doseinfo) => {
        let successEnv = {
          readonly:true,
          hash: doseinfo.hash,
          index:index,
          verified: true,
          type: doseinfo.dose.type,
          nonce: doseinfo.dose.nonce.slice(0,10) + "...",
          fullNonce: doseinfo.dose.nonce
        }
        emptyDoseHtml.replaceWith(personDoseTemplate(successEnv));
      })
      .catch((error) => {
        console.log(error);
        let errorEnv = {
          readonly:true,
          index:index,
          error: true,
          type: "Error",
          nonce: error
        };
        emptyDoseHtml.replaceWith(personDoseTemplate(errorEnv));
      });
  }

  $('#refreshVaccButton').click(function() {
    if(privateKeyPresent && registered) {
      $('#itemlist').empty();
      registryConnection.getNumberOfVaccinations()
        .then(function(result) {
          //console.log("have " + result);
          for(let i=0;i<result;i++) {
            verifyVacc($('#privateKey').val(), i);
          }
        })
        .catch((error) => {
          displayError(error);
        });

    }
  });

  $('#itemlist').on("click", '.discloseBtn', function() {
    var cardcol = $(this).closest('.cardcol');
    var doseType = cardcol.find('.doseType').text();
    var doseNonce = cardcol.find('.doseNonce').val();
    var doseHash = cardcol.find('.doseHash').val();
    var doseIndex = cardcol.find('.doseIndex').val();

    var recAddress = cardcol.find('.recipientAddress').val();
    if(recAddress !== "" && web3.utils.isAddress(recAddress)) {
      cardcol.find('.recAddress').removeClass('is-invalid');

      if(setupComplete) {
        let d = new window.vaccination.Dose(0, doseNonce, doseType);
        let remover = addLoadingAnimation(cardcol.find('.discloseBtn'));
        //console.log("Disclosing: ");
        //console.log({a:doseHash, b:d, c:doseIndex, d:recAddress});
        registryConnection.discloseVaccination(doseHash, d, doseIndex, recAddress)
          .then(() => {
            displaySuccess("Vaccination disclosed");
            remover();
          })
          .catch((error) => {
            displayError(error);
            remover();
          });
      } else {
        notConnected();
      }
    } else {
      cardcol.find('.recAddress').addClass('is-invalid');
    }
  });

  $('#setSharedAddressBtn').click(function() {
    if(!privateKeyPresent) {
      $('#privateKey').addClass('is-invalid');
      return;
    }
    $('#privateKey').removeClass('is-invalid');
    var discAddress = $('#sharedAddress').val();
    if(discAddress !== "" && web3.utils.isAddress(discAddress)) {
      $('#sharedAddress').removeClass('is-invalid');
      if(registered && setupComplete) {
        // empty shared list
        $('#sharedlist').empty();
        registryConnection.getNumberOfDisclosedVaccinations(discAddress)
          .then((numVacc) => {
            // For each disclosed vaccination check validity
            for(let i=0;i<numVacc;i++) {
              verifyDisclosedVaccination($('#privateKey').val(), discAddress, i);
            }
          })
          .catch((error) => {
            displayError(error);
          });
      } else {
        notConnected();
      }
    } else {
      $('#sharedAddress').addClass('is-invalid');
    }

  });

  checkRegisterStatus();
}
