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
    this._isLocalOperation = false;
    return this._localDatastore.put(obj, key);
  },

  get: function(key) {
    return this._localDatastore.get(key);
  },

  add: function(obj, key) {
    this._isLocalOperation = false;
    return this._localDatastore.add(obj, key).then((id) => {
      return this._addId(id);
    });
  },

  remove: function(key) {
    this._isLocalOperation = false;
    this._localDatastore.remove(key).then(() => {
      return this._removeId(key);
    });
  },

  clear: function(options) {
    if (options && options.onlyLocal === true) {
      this._isLocalOperation = true;
    }
    else {
      this._isLocalOperation = false;
    }
    return this._localDatastore.clear().then(() => {
      return this._clearIds();
    });
  },

  // Returns all the ids
  getAll: function() {
    return new Promise(function(resolve, reject) {
      window.asyncStorage.getItem('dataStoreIds', resolve, reject);
    });
  },

  // For the moment we only support full sync
  sync: function(revisionId) {
    return new Promise((resolve, reject) => {
      Rest.get(SERVICE_URL + '/' + this._localDatastore.name + '/' +
        'sync/get_all' + '?token=' + this._token, {
          success: (result) => {
            console.log('Succesfully obtained the data remotely: ',
                        typeof result);
            var ids = [];
            var operations = [];
            // Avoid to process modification events (onchange event)
            this._isLocalOperation = true;

            var objectData = result.objectData;
            var mediaInfo = result.mediaInfo;

            for(var prop in objectData) {
              var obj = objectData[prop];
              var id = Number(prop);
              console.log('Obj obtained: ', id, obj.title);
              ids.push(id);
              operations.push(this._localDatastore.add(obj, id));
            }

            Promise.all(operations).then((addedIds) => {
              console.log('Add operations result: ', addedIds);
              return this._setIds(ids);
            }).then(() => {
                // Now we need to get all the media
                var mediaOperations = [];
                var mediaSync = new MediaSynchronizer(this._token,
                            this._localDatastore.name, Object.keys(mediaInfo));
                mediaSync.start();

                mediaSync.onmediaready = (id, blob) => {
                  if (!blob) {
                    console.warn('No blob could be retrieved for: ', id);
                    return;
                  }
                  // Once the blob is ready it has to be persisted in the local
                  // database
                  var objectId = mediaInfo[id].objId;
                  var objectProperty = mediaInfo[id].objProp;

                  var object = objectData[objectId];
                  object[objectProperty] = blob;
                  // Here we update the corresponding object
                  mediaOperations.push(
                            this._localDatastore.put(object, Number(objectId)));
                };

                mediaSync.onfinish = () => {
                  Promise.all(mediaOperations).then(() => {
                    resolve();
                  });
                }

            }, reject);
          },

          error: function(err) {
            console.error('Error while calling the service');
            reject(err);
          },

          timeout: function() {
            console.error('Timeout while calling the service');
            reject({
              name: 'timeout'
            });
          }
        },
        {
          operationsTimeout: 10000
        });
    });
  },

  _removeId: function(id) {
    return new Promise(function(resolve, reject) {
      asyncStorage.getItem('dataStoreIds', function onListReady(list) {
        var index = list.indexOf(id);
        if (index === -1) {
          reject('not found');
          return;
        }
        list.splice(index, 1);
        asyncStorage.setItem('dataStoreIds', list, resolve, reject);
      });
    });
  },

  _addId: function (id) {
    return new Promise(function(resolve, reject) {
      asyncStorage.getItem('dataStoreIds', function onListReady(list) {
        var newList = list || [];
        newList.push(id);
        asyncStorage.setItem('dataStoreIds', newList, resolve.bind(null, id),
                             reject);
      });
    });
  },

  _clearIds: function() {
    return new Promise(function(resolve, reject) {
      asyncStorage.setItem('dataStoreIds', null, resolve, reject);
    });
  },

  _setIds: function(idList) {
    return new Promise(function(resolve, reject) {
      asyncStorage.setItem('dataStoreIds', idList, resolve, reject);
    });
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
    if (this._isLocalOperation === true) {
      console.log('It is a local operation ....');
      return;
    }

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
                 encodeURIComponent('__all__') + '?token=' + self._token,
          {
            success: function() {
            console.log('Succesfully cleared remotely')
          },
          error: function() {
            console.error('Error while calling the service');
          },
          timeout: function() {
            console.error('Timeout while calling the service');
          }
        }, {
              method: 'DELETE',
              operationsTimeout: 10000
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


var MediaSynchronizer = function(token, dsName, mediaList) {
  var next = 0;
  var self = this;

  this.mediaList = mediaList;
  this.dsName = dsName;
  this.token = token;

  this.start = function() {
    retrieveMedia(this.mediaList[next]);
  };

  function mediaRetrieved(blob) {
    if (typeof self.onmediaready === 'function') {
      var id = self.mediaList[next];

      setTimeout(function() {
        self.onmediaready(id, blob);
      },0);
    }

    // And lets go for the next
    next++;
    if (next < self.mediaList.length) {
      retrieveMedia(self.mediaList[next]);
    }
    else {
      if (typeof self.onfinish === 'function') {
        self.onfinish();
      }
    }
  }

  function retrieveMedia(mediaId) {
    console.log('Going to retrieve media: ', mediaId);

    Rest.get(SERVICE_URL + '/' + self.dsName + '/' + 'blob' + '/' + mediaId +
             '?token=' + self.token, {
      success: mediaRetrieved,
      error: (err) => mediaRetrieved(null),
      timeout: () => {
        console.error('Timeout!!!');
        // In this case we would need to have an array of pending tasks
        mediaRetrieved(null);
      }
    }, {
        operationsTimeout: 10000,
        responseType: 'blob'
    });
  }
};
