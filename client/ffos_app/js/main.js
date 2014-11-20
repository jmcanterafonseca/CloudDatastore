'use strict';

console.log('We are here!');

alert('here');

(function() {

  document.querySelector('button').addEventListener('click', saveData);

  function saveData() {
    navigator.getDataStores('myDatastore').then(function(list) {
      var datastore = list[0];

      var cloudDatastore = new CloudDatastore(datastore);

      cloudDatastore.add(getFormData);
    });
  }

  function getFormData() {
    return document.querySelector('form').elements['text-data'].value;
  }

})();

