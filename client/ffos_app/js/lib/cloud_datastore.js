// Copyright (c) 2014 Telefónica I+D S.A.U.

'use strict';

var SERVICE_URL = 'http://81.45.21.204/dsapi';

function CloudDatastore(localDatastore, token) {
  this.name = name;
  this._token = token;
  this._localDatastore = localDatastore;
  // To associate object id with blob
  this._objectBlob = null;
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

  remove: function(key) {
    return this._localDatastore.remove(key);
  },

  clear: function() {
    return this._localDatastore.clear();
  },

  _saveBlobData: function() {
    return new Promise((resolve, reject) => {
      window.asyncStorage.setItem('blobData', this._objectBlob,
                                  resolve, reject);
    });
  },

  _retrieveBlobData: function() {
    if (this._objectBlob) {
      return Promise.resolve();
    }

    return new Promise((resolve, reject) => {
      window.asyncStorage.getItem('blobData', (data) => {
        this._objectBlob = data || Object.create(null);
        resolve();
      }, reject);
    });
  },

  _getData: function getData(object, id) {
    return new Promise((resolve, reject) => {
      this._retrieveBlobData().then(() => {
        var out = {
          object: Object.create(null),
          blobs: [],
          blobsUrl: []
        };

        var operations = [], blobs = [], properties = [];
        for(var prop in object) {
          var value = object[prop];
          if (!value) {
            continue;
          }

          if (!isBlob(value)) {
            out.object[prop] = value;
          }
          else {
            var stringId = String(id);
            this._objectBlob[stringId] = this._objectBlob[stringId] || [];

            operations.push(calculateHash(value));
            blobs.push(value);
            properties.push(prop);
          }
        }

        if (operations.length === 0) {
          resolve(out);
          return;
        }

        Promise.all(operations).then((hashes) => {
          hashes.forEach((aHash, index) => {
            var result = this._objectBlob[stringId].filter((obj) => {
              return obj.hash === aHash;
            });
            if (result.length === 0) {
              console.log('New blob found on property ...', properties[index]);
              var blobUrl = window.URL.createObjectURL(blobs[index]);
              out.object[properties[index]] = blobUrl;
              out.blobs.push(blobs[index]);
              out.blobsUrl.push(blobUrl);

              this._objectBlob[stringId].push({
                hash: aHash,
                url: blobUrl
              });
            }
            else {
              console.log('Blob is the same skipping ...');
              out.object[properties[index]] = result[0].url;
            }
          });

          this._saveBlobData();
          resolve(out);
        });
      });
    });
  },

  handleEvent: function(e) {
    var self = this;

    console.log('Event listener: ', e.type, e.id, e.operation);

    if (e.type !== 'change') {
      return;
    }

    var affectedKey = e.id;
    var operation = e.operation;

    var revisionId = this._localDatastore.revisionId;

    console.log('Revision Id: ', revisionId, operation);

    // And now execute the operation against the cloud
    switch (operation) {
      case 'added':
        this._localDatastore.get(affectedKey).then((obj) => {
          return this._getData(obj, affectedKey);
        }).then((adaptedObj) => {
          RestPost(SERVICE_URL + '/' + self._localDatastore.name
                + '/' +  affectedKey + '?token=' + self._token, adaptedObj, {
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
        this._localDatastore.get(affectedKey).then((obj) => {
          return this._getData(obj, affectedKey);
        }).then((adaptedObj) => {
          RestPost(SERVICE_URL + '/' + self._localDatastore.name
                + '/' + affectedKey + '?token=' + self._token, adaptedObj, {
                method: 'POST'
            },{
            success: function() {
              console.log('Succesfully updated remotely')
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

      case 'removed':
        console.log('REMOVED!!!!');
        RestPost(SERVICE_URL + '/' + self._localDatastore.name
                   + '/' + affectedKey + '?token=' + self._token, null, {
                    method: 'DELETE',
                    operationsTimeout: 10000
              }, {
                  success: function() {
                    console.log('Succesfully removed remotely')
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
        this._objectBlob = null;
        this._saveBlobData();
        Rest.get(SERVICE_URL + '/' + self._localDatastore.name + '/' +
                 encodeURIComponent('__all__') + '?token=' + self._token, null,
            {
              method: 'DELETE',
              operationsTimeout: 10000
          },{
          success: function() {
            console.log('Succesfully cleared remotely')
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

function calculateHash(photo) {
  return new Promise(function(resolve, reject) {
    var START_BYTES = 127;
    var BYTES_HASH = 16;

    var out = [photo.type, photo.size];

    // We skip the first bytes that typically are headers
    var chunk = photo.slice(START_BYTES, START_BYTES + BYTES_HASH);
    var reader = new FileReader();
    reader.onloadend = function() {
      out.push(reader.result);
      resolve(out.join(''));
    };
    reader.onerror = function() {
      window.console.error('Error while calculating the hash: ',
                           reader.error.name);
      resolve(out.join(''));
    };
    reader.readAsDataURL(chunk);
  });
}

function isBlob(obj) {
  return obj.size && obj.type && typeof obj.slice === 'function';
}

function getBlobId(url) {
  // Ensure it starts with a letter
  var val = 'd' + '_' + url.substring(url.lastIndexOf('/') + 1);
  return val.replace(/-/g, '_');
}

function RestPost(url, data, options, cbs) {
  var xhr = new XMLHttpRequest({
    mozSystem: true
  });

  xhr.open(options.method || 'POST', url, true);
  var responseType = options.responseType || 'json';
  xhr.responseType = responseType;

  xhr.onload = function() {
    if (xhr.status === 200) {
      cbs.success(xhr.response);
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

  var postData = null;
  if (data && (!data.blobs || data.blobs.length === 0)) {
    xhr.setRequestHeader('Content-Type', 'application/json; charset=UTF-8');
    postData = JSON.stringify(data.object || data);
  }
  else if (data && data.blobs && data.blobs.length > 0) {
    console.log('There is a blob!!!', data.blobs.length);
    var postData = new FormData();
    postData.append('object', JSON.stringify(data.object));
    data.blobs.forEach(function(aBlob, index) {
      postData.append(getBlobId(data.blobsUrl[index]), aBlob);
    });
  }

  xhr.send(postData);
}
