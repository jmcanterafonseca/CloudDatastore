'use strict';

alert('here');

function login(refresh) {
  if (typeof refresh === 'undefined') {
    refresh = true;
  }
  window.asyncStorage.getItem('mobileIdData', function(data) {
    if (!data) {
      navigator.getMobileIdAssertion({
        forceSelection: true
      }).then(onLogin, onLoginError);

      return;
    }
    ListManager.start(data.token, refresh);
  });
}

function onLogin(assertion) {
  getPushEndPoint().then((pushEndPoint) => {
    var registerUrl = 'http://81.45.21.204/ds/register';
    RestPost(registerUrl, {
      assertion: assertion,
      audience: window.location.origin,
      pushEndPoint: pushEndPoint
    }, {
      method: 'POST'
    },
    {
      success: onRegistered,
      error: () => alert('Error registering!!!'),
      timeout: () => console.error('Timeout!!!')
    });

    console.log('Mobile Id available: ', assertion);
  });
}

function onLoginError(err) {
  alert('error: ', err.name);
}

function onRegistered(response) {
  window.asyncStorage.setItem('mobileIdData', response);

  document.querySelector('#logged-as').textContent = response &&
                                                            response.msisdn;

  ListManager.start(response.token, true);
}


function getPushEndPoint() {
  return new Promise(function(resolve, reject) {
    window.asyncStorage.getItem('pushEndPoint', function(data) {
      if (!data) {
        var req = navigator.push.register();

        req.onsuccess = function() {
          var endPoint = req.result;
          var resolveFunction = resolve.bind(null, endPoint);
          window.asyncStorage.setItem('pushEndPoint', endPoint, resolveFunction,
                                      reject);
        }

        req.onerror = function() {
          console.log('Error while registering push token: ', req.error.name);
        }
      }
      else {
        resolve();
      }
    });
  });
}

function logout(token) {
  return new Promise(function(resolve, reject) {
    var unRegisterUrl = 'http://81.45.21.204/ds/unregister';
    Rest.get(unRegisterUrl + '?token=' + token,
    {
      success: resolve,
      error: () => alert('Error unregistering!!!'),
      timeout: () => console.error('Timeout!!!')
    }, {
        operationsTimeout: 10000
    });
  });
}

function handlePush(e) {
  console.log('Push message received. Version: ', e.version);

  /*
  var notif = new Notification('Cloud Notes', {
    body: 'Your notes have changed'
  });
  */
  navigator.vibrate(600);

  ListManager.sync(Number(e.version));
}

login();
navigator.mozSetMessageHandler('push', handlePush);
