'use strict';

window.asyncStorage.getItem('mobileIdData', function(data) {
  if (!data) {
    navigator.getMobileIdAssertion({
      forceSelection: true
    }).then(onLogin, onLoginError);

    return;
  }

  ListManager.start(data.token);
});


function onLogin(assertion) {
  var registerUrl = 'http://81.45.21.204/ds/register';
  RestPost(registerUrl, {
    assertion: assertion,
    audience: window.location.origin
  }, {
    method: 'POST'
  },
  {
    success: onRegistered,
    error: () => alert('Error registering!!!'),
    timeout: () => console.error('Timeout!!!')
  });

  console.log('Mobile Id available: ', assertion);
}

function onLoginError(err) {
  alert('error: ', err.name);
}

function onRegistered(response) {
  window.asyncStorage.setItem('mobileIdData', response);

  document.querySelector('#logged-as').textContent = response &&
                                                            response.msisdn;

  ListManager.start(response.token);
}
