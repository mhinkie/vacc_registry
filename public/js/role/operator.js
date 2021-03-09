function setupOperator() {


  var doseTemplate = Handlebars.getTemplate('items/operator-dose-template');
  var operatorTemplate = Handlebars.getTemplate('operator-template');

  var opHtml = operatorTemplate({
    vaccines: vaccines
  });
  $('#main').html(opHtml);

  const NEW = 0;
  const PUBLISHED = 1;

  var doses = {};

  function updateStorage() {
    let dosesJ = JSON.stringify(doses);
    window.localStorage.setItem('operatorDoses', dosesJ);
  }

  function listDosesFromStorage() {
    $('#itemlist').html("");
    // Check in local storage if there are doses
    let dosesJ = window.localStorage.getItem('operatorDoses');
    if(dosesJ !== null) {
      doses = JSON.parse(dosesJ, handleObjects);
    }

    for(let hash in doses) {
      appendDoseUI(doses[hash], hash);
    }
  }

  function appendDose(newDose) {
    let hash = newDose.dose.hash();
    doses[hash] = newDose;
    appendDoseUI(newDose, hash);
    updateStorage();
  }

  function appendDoseUI(dose, hash) {
    var dHtml = doseTemplate(
      {
        status:dose.status,
        hash:hash,
        type: dose.dose.type,
        nonce: dose.dose.nonce.toString('base64').slice(0,10) + "..."
      }
    );
    $('#itemlist').append(dHtml);
  }

  // cardcol = the topmost element of the dose template
  function updateDoseUI(cardcol, dose, hash) {
    var dHtml = doseTemplate(
      {
        status:dose.status,
        hash:hash,
        type: dose.dose.type,
        nonce: dose.dose.nonce.toString('base64').slice(0,10) + "..."
      }
    );
    cardcol.replaceWith(dHtml);
  }

  function createDose(type) {
    var newDose = this.vaccination.createDose(type);
    return {dose:newDose,status:NEW};
  }

  function addVaccinator(addr, callback) {
    registryConnection.registry.grantRole(
        web3.utils.keccak256("VACCINATOR_ROLE"),
        addr,
        {from:registryConnection.me}
      )
      .then(() => {
        displaySuccess("Vaccinator added");
        callback();
      })
      .catch((error) => {
        displayError(error);
        callback();
      });
  }

  $('#createDoseBtn').click(function() {
    var type = $('#doseType').val();
    if(type === "") {
      // Error
      $('#doseType').addClass('is-invalid');
    } else {
      $('#doseType').removeClass('is-invalid');
      var newDose = createDose(type);
      appendDose(newDose);
    }
  });

  $('#addVaccinatorBtn').click(function() {
    var addr = $('#vaccAddr').val();
    if(addr !== null && web3.utils.isAddress(addr)) {
      let remover = addLoadingAnimation($(this));
      $('#vaccAddr').removeClass('is-invalid');
      addVaccinator(addr, remover);
      $('#vaccAddr').val(null);
    } else {
      $('#vaccAddr').addClass('is-invalid');
    }
  })

  // All future publish buttons will receive this handler
  $('#itemlist').on("click", '.publishDoseBtn', function() {
    let cardcol = $(this).closest('.cardcol'); // top of the card
    let doseHash = $(this).siblings('.doseHash').val();
    let dose = doses[doseHash].dose; //need inner part of the object (= class Dose)
    if(setupComplete) {
      if(doses[doseHash].status == NEW) {
        // Show we are doing stuff
        let remover = addLoadingAnimation($(this));

        // only if not already published
        registryConnection.addDose(dose)
          .then(() => {
            doses[doseHash].status = PUBLISHED;
            updateDoseUI(cardcol, doses[doseHash], doseHash);
            updateStorage();

            // Remove animation
            remover();
          })
          .catch((error) => {
            displayError(error);
            remover();
          });
      }
    } else {
      notConnected();
    }
  });

  $('#itemlist').on("click", '.printDoseBtn', function() {
    // just show the qr code that should be printed
    // (ofc there are no real doses to print it on)
    let cardbody = $(this).closest('.card-body');
    let doseHash = $(this).siblings('.doseHash').val();
    let dose = doses[doseHash].dose;
    console.log(JSON.stringify(dose.getPrintInformation()));
    $('<canvas class="qr-code" width="200" height="200"></canvas>')
      .appendTo(cardbody)
      .qrcode({
        render:'canvas',
        text: JSON.stringify(dose.getPrintInformation())
      });
  })

  $('#itemlist').on("click", '.closeButton', function() {
    var cardcol = $(this).closest('.cardcol'); // top of the card

    // search for dosehash
    var doseHash = cardcol.find('.doseHash').val();
    //console.log(`Removing ${doseHash}`);
    delete doses[doseHash];
    cardcol.remove();
    updateStorage();
  });

  listDosesFromStorage();
}
