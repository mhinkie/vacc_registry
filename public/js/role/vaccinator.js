function setupVaccinator() {
  var vaccinatorTemplate = Handlebars.getTemplate('vaccinator-template');
  var doseTemplate = Handlebars.getTemplate('items/vaccinator-dose-template');
  var vacHtml = vaccinatorTemplate({vaccines:vaccines});
  $('#main').html(vacHtml);

  const PROCESSING = 0;
  const VERIFIED = 1;
  const VERIFICATION_FAILED = 2;
  const USED = 3;
  var doses = {};

  function updateStorage() {
    let dosesJ = JSON.stringify(doses);
    window.localStorage.setItem('vaccinatorDoses', dosesJ);
  }

  function listDosesFromStorage() {
    $('#itemlist').html("");
    // Check in local storage if there are doses
    let dosesJ = window.localStorage.getItem('vaccinatorDoses');
    if(dosesJ !== null) {
      doses = JSON.parse(dosesJ, handleObjects);
    }

    for(let hash in doses) {
      appendDoseUI(doses[hash], hash);
    }
  }

  function appendDoseUI(dose, hash) {
    var dHtml = doseTemplate(
      {
        verified:dose.status == VERIFIED || dose.status == USED,
        processing:dose.status == PROCESSING,
        verification_failed:dose.status == VERIFICATION_FAILED,
        error_message:dose.verification_error,
        used:dose.status == USED,
        used_on:dose.used_on,
        hash:hash,
        type: dose.dose.type,
        nonce: dose.dose.nonce.toString('base64').slice(0,10) + "..."
      }
    );
    $('#itemlist').append(dHtml);
  }

  function createRawDose(type, labelinfo) {
    // Tries to parse the label information and returns the dose on success
    // Only an object {s:..., n:..., type:...} will be returned (not a propert Dose)
    // Throws error on failure
    try {
      let parsedInfo = JSON.parse(labelinfo);
      // should now have {s:..., n:...}
      parsedInfo.type = type;
      return parsedInfo;
    } catch(e) {
      throw "Labelinfo is not properly formatted";
    }
  }

  // Creates the full dose from a raw dose (createRawDose)
  async function createFullDose(rawDose) {
    // This is created to have the info stored in case of errors
    // The actual verification returns a ready to use dose on success
    let dummy = new this.vaccination.Dose(
      this.vaccination.Buffer.from(rawDose.s, 'base64'),
      rawDose.n,
      rawDose.type);

    if(dummy.hash() in doses) {
      // Already exists - do nothing
      displayError("Dose already processed");
      return;
    }
    // First show that we are processing this dose
    let cardEnv = {
      verified:false,
      processing:true,
      verification_failed:false,
      hash:"",
      type:rawDose.type,
      nonce:rawDose.n.slice(0,10) + "..."
    };
    // If there are comments or text (even linebreaks)
    // Before the first div in the template they each count as
    // a jquery object = it would later replace all of them
    // with a new card each - this is why .cardcol is explicitly selected
    let dHtml = $(doseTemplate(cardEnv)).filter('.cardcol');
    dHtml = dHtml.appendTo($('#itemlist'));


    // Actual verification with registry
    registryConnection.verifyDose(rawDose.s, rawDose.n, rawDose.type)
    .then((result) => {
      // Properly verified - dose is returned
      // Add the resulting dose
      doses[result.hash()] = {
        dose: result,
        status: VERIFIED,
        verification_error: null
      };

      // Replace the "processing" dose with a verified dose on UI
      cardEnv.verified = true;
      cardEnv.processing = false;
      cardEnv.hash = result.hash();
      let newDose = doseTemplate(cardEnv);
      dHtml.replaceWith(newDose);
      updateStorage();
    })
    .catch((error) => {
      // some error occured...
      // Still add the resulting dose so the error info is saved for the user
      doses[dummy.hash()] = {
        dose: dummy,
        status: VERIFICATION_FAILED,
        verification_error: error
      };

      // Replace the "processing" dose with an error dose on UI
      cardEnv.verification_failed = true;
      cardEnv.processing = false;
      cardEnv.hash = dummy.hash();
      cardEnv.error_message = error;
      dHtml.replaceWith(doseTemplate(cardEnv));
      updateStorage();
    });
  }

  function vaccinate(patient, doseInfo, doseUI) {
    let remover = addLoadingAnimation(doseUI.find('.vaccinateBtn'));
    registryConnection.vaccinate(doseInfo.dose, patient)
      .then(() => {
        doseInfo.status = USED;
        doseInfo.used_on = patient;
        doses[doseInfo.dose.hash()] = doseInfo;
        updateStorage();
        remover();
        doseUI.find('.vaccinateBtn').prop('disabled', true);
        doseUI.find('.patientAddress').prop('disabled', true);
      })
      .catch((error) => {
        displayError(error);
        remover();
      });
  }


  $('#verifyDoseBtn').click(function() {
    let type = $('#doseType').val();
    if(type === "") {
      $('#doseType').addClass('is-invalid');
    } else {
      $('#doseType').removeClass('is-invalid');
      let labelinfo = $('#labelInfo').val();
      if(labelinfo === "") {
        $('#labelInfo').addClass('is-invalid');
      } else {
        $('#labelInfo').removeClass('is-invalid');
        // Since verification needs a conneciton to the contract
        // This will only be allowed once the setup is complete
        if(setupComplete) {
          try {
            let newDose = createRawDose(type, labelinfo);
            // Start processing of full dose without waiting for result
            createFullDose(newDose);
            // Remove labelinfo value so the next one can be read
            $('#labelInfo').val(null);
          } catch (e) {
            // Dont remove labelinfo text but show error
            displayError(e);
          }
        } else {
          notConnected();
        }

      }
    }
  });

  $('#itemlist').on("click", '.closeDoseButton', function() {
    var cardcol = $(this).closest('.cardcol'); // top of the card

    // search for dosehash
    var doseHash = cardcol.find('.doseHash').val();
    //console.log(`Removing ${doseHash}`);
    delete doses[doseHash];
    cardcol.remove();
    updateStorage();
  });

  $('#itemlist').on("click", '.vaccinateBtn', function() {
    var cardcol = $(this).closest('.cardcol');
    var doseHash = cardcol.find('.doseHash').val();

    var doseInfo = doses[doseHash];
    if(doseInfo.status == VERIFIED) {
      var patientAddress = cardcol.find('.patientAddress').val();
      if(patientAddress !== "" && web3.utils.isAddress(patientAddress)) {
        cardcol.find('.patientAddress').removeClass('is-invalid');

        if(setupComplete) {
          vaccinate(patientAddress, doseInfo, cardcol);
        } else {
          notConnected();
        }
      } else {
        cardcol.find('.patientAddress').addClass('is-invalid');
      }
    } else {
      displayError("Dose not verified");
    }

  });

  listDosesFromStorage();
}
