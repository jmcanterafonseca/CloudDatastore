'use strict';

function login() {
  window.asyncStorage.getItem('mobileIdData', function(data) {
    if (!data) {
      navigator.getMobileIdAssertion({
        forceSelection: true
      }).then(onLogin, onLoginError);

      return;
    }
    ListManager.start(data.token);
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

  ListManager.start(response.token);
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
        resolve(data);
      }
    });
  });
}

function handlePush(e) {
  console.log('Push message received. Version: ', e.version);
  /*
   var notif = new Notification('Cloud Gallery', {
    body: 'Gallery has changed'
  });

  if (state === 'running') {
    togglePick();
    Gallery.newVersion(e.version);
  }
  else {
    window.close();
  }
*/
  ListManager.sync();
}

login();
navigator.mozSetMessageHandler('push', handlePush);
