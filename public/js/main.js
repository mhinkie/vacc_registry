var navigationTemplate = Handlebars.getTemplate('navigation-template');

var web3;
var setupComplete = false;
var registryConnection = null;
var checkDone = false;

// Types of available vaccines - could be extended in each client - for now is hardcoded
// Will be used to create doses by operators and to verify doses by
// vaccinators and patients
var vaccines = [
  "Chickenpox",
  "Cholera",
  "Diphtheria, tetanus, pertussis",
  "HIB",
  "HPV",
  "Hepatitis A",
  "Hepatitis B",
  "Influenza",
  "Japanese encephalitis",
  "Measles, mumps, rubella",
  "Meningococcus",
  "Pneumococcus",
  "Polio",
  "Rabies",
  "Rotavirus",
  "Thyphoid fever",
  "Tick-borne encephalitis",
  "Yellow fever"
];

// Expected a function as argument which will be called as soon as the
// check for the registry connection is complete
var callbacks = [];
function asSoonAsConnectionChecked(func) {
  if(checkDone) {
    // The connection check is done - the function can be called directly
    func();
  } else {
    // Add it to list of functions to call
    callbacks.push(func);
  }
}

function notConnected() {
  displayError("Registry connection not established.")
}

function displayError(description) {
  $('#globalAlert').removeClass('alert-success');
  $('#globalAlert').addClass('alert-danger');
  $('#globalAlert').text(description);
  $('#globalAlert').fadeIn('fast').delay(5000).fadeOut('fast');
}

// Display sucess that is not apparent from changes in the ui
function displaySuccess(message) {
  $('#globalAlert').removeClass('alert-danger');
  $('#globalAlert').addClass('alert-success');
  $('#globalAlert').text(message);
  $('#globalAlert').fadeIn('fast').delay(5000).fadeOut('fast');
}

function setupNavBar() {
  var navHtml = navigationTemplate({});
  $('.navbar').html(navHtml);

  $('#operatorBtn').click(function() {
    window.location.href = updateUrlParameter(window.location.href, 'role', 'operator');
  });
  $('#vaccinatorBtn').click(function() {
    window.location.href = updateUrlParameter(window.location.href, 'role', 'vaccinator');
  });
  $('#personBtn').click(function() {
    window.location.href = updateUrlParameter(window.location.href, 'role', 'person');
  });
  $('#setContractSubmit').click(function() {
    var address = $("#contract").val();
    window.location.href = updateUrlParameter(window.location.href, 'contract', address);
  });
  $('#setMeSubmit').click(function() {
    var address = $("#me").val();
    window.location.href = updateUrlParameter(window.location.href, 'me', address);
  });
}

function setupContent() {
  web3 = new Web3(new Web3.providers.HttpProvider("http://localhost:8545"));

  var contract = $.urlParam('contract');
  if(contract !== null && web3.utils.isAddress(contract)) {
    $('.navbar #contract').val(contract);
  } else {
    contract = null;
  }
  var me = $.urlParam('me');
  if(me !== null && web3.utils.isAddress(me)) {
    $('.navbar #me').val(me);
  } else {
    me = null;
  }
  var registryConnection = null;

  web3.eth.net.isListening().then(function(isListening) {
    if(isListening) {
      if(contract != null && me != null) {
        // Get contract instance for VaccinationRegistry
        var web3Instance = new web3.eth.Contract(vaccinationRegistryAbi, contract);
        var instance = new RegistryWrapper(web3Instance);
        // Everything is ready: init wrapper
        this.registryConnection = new this.vaccination.RegistryConnection(instance, me);
        $('.navbar #connectionStatus').removeClass('text-danger');
        $('.navbar #connectionStatus').addClass('text-success');
        $('.navbar #connectionStatus').text("Connected");
        setupComplete = true;
      }
    } else {
      console.log("Web3 not connected");
    }

    // As soon as checking is done, notifiy everyone that is waiting
    checkDone = true;
    for(let f of callbacks) {
      f();
    }
  });


  var role = $.urlParam('role');
  switch(role) {
    case "operator":
      $('#nav-operator').addClass("active");
      setupOperator();
      break;
    case "vaccinator":
      $('#nav-vaccinator').addClass("active");
      setupVaccinator();
      break;
    case "person":
      $('#nav-person').addClass("active");
      setupPerson();
      break;
    default:
      // no valid role given - just show welcome message
      var template = Handlebars.getTemplate('welcome-template');
      var tHtml = template({});
      $('#main').html(tHtml);
      break;
  }

}

$(function() {
  // General setup
  setupNavBar();

  // Role specific setup
  setupContent();
});
