// Copyright (c) 2014 Telefónica I+D S.A.U.

'use strict';

var SERVICE_URL = 'http://81.45.21.204/dsapi';

function CloudDatastore(localDatastore, token) {
  this.name = name;
  this._token = token;
  this._localDatastore = localDatastore;
  localDatastore.addEventListener('change', this);
}

CloudDatastore.prototype = {
  put: function(obj, key) {
    return this._localDatastore.put(obj, key);
  },

  get: function(key) {
    return this._localDatastore.get(key);
  },

  add: function(obj, key) {
    return this._localDatastore.add(obj, key);
  },

  remove: function(obj, key) {
    return this._localDatastore.remove(key);
  },

  clear: function() {
    return this._localDatastore.clear();
  },

  handleEvent: function(e) {
    var self = this;

    console.log('Event listener: ', e.type, e.id, e.operation);

    if (e.type !== 'change') {
      return;
    }

    var affectedKey = e.id;
    var operation = e.operation;

    // And now execute the operation against the cloud
    switch (operation) {
      case 'added':
        this._localDatastore.get(affectedKey).then(function succ(obj) {
          RestPost(SERVICE_URL + '/' + self._localDatastore.name
                   + '/' + affectedKey + '?token=' + self._token, obj, {
                    method: 'PUT'
                   },{
            success: function() {
              console.log('Succesfully added to the service')
            },
            error: function() {
              console.error('Error while calling the service');
            },
            timeout: function() {
              console.error('Timeout while calling the service');
            }
          });
          }, function err(err) { });
      break;

      case 'updated':
        this._localDatastore.get(affectedKey).then(function succ(obj) {
          RestPost(SERVICE_URL + '/' + self._localDatastore.name
                   + '/' + affectedKey + '?token=' + self._token, obj, {
                    method: 'POST'
            },{
            success: function() {
              console.log('Succesfully added to the service')
            },
            error: function() {
              console.error('Error while calling the service');
            },
            timeout: function() {
              console.error('Timeout while calling the service');
            }
          });
          }, function err(err) { });
      break;

      case 'deleted':
        Rest.get(SERVICE_URL + '/' + self._localDatastore.name
                   + '/' + affectedKey + '?token=' + self._token, {
                    method: 'DELETE',
                    operationsTimeout: 10000
              }, {
                  success: function() {
                    console.log('Succesfully added to the service')
                  },
                  error: function() {
                    console.error('Error while calling the service');
                  },
                  timeout: function() {
                    console.error('Timeout while calling the service');
                  }
        });
      break;

      case 'cleared':
        Rest.get(SERVICE_URL + '/' + self._localDatastore.name + '/' +
                 encodeURIComponent('__all__') + '?token=' + self._token, null,
            {
              method: 'DELETE',
              operationsTimeout: 10000
          },{
          success: function() {
            console.log('Succesfully added to the service')
          },
          error: function() {
            console.error('Error while calling the service');
          },
          timeout: function() {
            console.error('Timeout while calling the service');
          }
        });
      break;
    }
  }
}

function RestPost(url, obj, options, cbs) {
  var xhr = new XMLHttpRequest({
    mozSystem: true
  });

  xhr.open(options.method, url, true);

  var formData = null;
  if (obj) {
    formData = new FormData();
    formData.append('object', JSON.stringify(obj));
  }

  xhr.onload = function() {
    if (xhr.status === 200) {
      cbs.success();
    }
    else {
      cbs.error();
    }
  }

  xhr.onerror = function() {
    cbs.error();
  }

  xhr.ontimeout = function() {
    cbs.timeout();
  }

  xhr.send(formData);
}
