// Copyright (c) 2014 Telefónica I+D S.A.U.

'use strict';

var SERVICE_URL = 'http://81.45.21.204/dsapi';

// Wraps a local datastore, making it capable of syncing data remotely to the
// cloud. Token is something to be obtained as part of the authentication
// process (Firefox Accounts, MobileId, or others)
function CloudDatastore(localDatastore, token) {
  this.name = name;

  this._token = token;
  this._localDatastore = localDatastore;
  // To associate object id with blob
  this._objectBlob = null;

  // To associate localRevisionIds with remote ones
  this._localRemoteRevisions = null;
  this._revisionGraph = null;

  // We listen for connecivity changes and for local data changes
  localDatastore.addEventListener('change', this);
  window.addEventListener('online', this);
  window.addEventListener('offline', this);
}

CloudDatastore.prototype = {

  put: function(obj, key, options) {
    this._isLocalOperation = options && options.onlyLocal;
    var originalRevisionId = this._localDatastore.revisionId;
    console.log('Original Revision Id: ', this._localDatastore.revisionId);

    var datastoreSequence = function(revisionId, isLocal, e) {
      this._localDatastore.removeEventListener('change', datastoreSequence);
      if (e.operation !== 'updated' && e.id !== key || isLocal) {
        return;
      }
      this._addToRevisionGraph(revisionId, e.revisionId);
    }.bind(this, originalRevisionId, this._isLocalOperation);

    this._localDatastore.addEventListener('change', datastoreSequence);
    return this._retrieveRevisionMetadata().then(() => {
      return this._localDatastore.put(obj, key).then(() => {
        return this._addId(key);
      });
    });
  },

  get: function(key) {
    return this._localDatastore.get(key);
  },

  add: function(obj, key, options) {
    this._isLocalOperation = options && options.onlyLocal;
    var originalRevisionId = this._localDatastore.revisionId;
    console.log('Original Revision Id: ', this._localDatastore.revisionId);

    var datastoreSequence = function(revisionId, isLocal, e) {
      this._localDatastore.removeEventListener('change', datastoreSequence);
      if (e.operation !== 'added' && e.id !== key || isLocal) {
        return;
      }
      this._addToRevisionGraph(revisionId, e.revisionId);
    }.bind(this, originalRevisionId, this._isLocalOperation);

    this._localDatastore.addEventListener('change', datastoreSequence);
    return this._retrieveRevisionMetadata().then(() => {
      return this._localDatastore.add(obj, key).then((id) => {
        return this._addId(id);
      });
    });
  },

  remove: function(key, options) {
    this._isLocalOperation = options && options.onlyLocal;
    var originalRevisionId = this._localDatastore.revisionId;
    console.log('Original Revision Id: ', this._localDatastore.revisionId);

    var datastoreSequence = function(revisionId, isLocal, e) {
      this._localDatastore.removeEventListener('change', datastoreSequence);
      if (e.operation !== 'removed' && e.id !== key || isLocal) {
        return;
      }
      this._addToRevisionGraph(revisionId, e.revisionId);
    }.bind(this, originalRevisionId, this._isLocalOperation);

    this._localDatastore.addEventListener('change', datastoreSequence);

    return this._retrieveRevisionMetadata().then(() => {
      return this._localDatastore.remove(key).then(() => {
        return this._removeId(key);
      });
    });
  },

  clear: function(options) {
    this._isLocalOperation = options && options.onlyLocal;
    var originalRevisionId = this._localDatastore.revisionId;
    console.log('Original Revision Id: ', this._localDatastore.revisionId);

    var datastoreSequence = function(revisionId, isLocal, e) {
      this._localDatastore.removeEventListener('change', datastoreSequence);
      if (e.operation !== 'clear' || isLocal) {
        return;
      }
      this._addToRevisionGraph(revisionId, e.revisionId);
    }.bind(this, originalRevisionId, this._isLocalOperation);

    return this._retrieveRevisionMetadata().then(() => {
      return this._clearMetadata();
    }).then(() => {
        return this._localDatastore.clear();
    });
  },

  setToken: function(token) {
    this._token = token;
  },

  _retrieveRevisionGraph: function(refresh) {
    if (this._revisionGraph && !refresh) {
      return Promise.resolve(this._revisionGraph);
    }
    return new Promise((resolve, reject) => {
      window.asyncStorage.getItem('revisionGraph', resolve, reject);
    });
  },

  _retrieveLocalRemoteRevisions: function(refresh) {
    if (this._localRemoteRevisions && !refresh) {
      return Promise.resolve(this._localRemoteRevisions);
    }
    return new Promise((resolve, reject) => {
      window.asyncStorage.getItem('localRemoteRevisions', resolve, reject);
    });
  },

  _retrieveRevisionMetadata: function() {
    return this._retrieveRevisionGraph().then((result) => {
      this._revisionGraph = result || Object.create(null);
      return this._retrieveLocalRemoteRevisions();
    }).then((data) => {
        this._localRemoteRevisions = data || Object.create(null);
        return Promise.resolve();
    });
  },

  _saveRevisionMetadata: function() {
    return this._saveRevisionGraph().then(() => {
      return this._saveLocalRemoteRevisions();
    });
  },

  _saveRevisionGraph: function() {
    return new Promise((resolve, reject) => {
      window.asyncStorage.setItem('revisionGraph', this._revisionGraph,
                                  resolve, reject);
    });
  },

  _saveLocalRemoteRevisions: function() {
    return new Promise((resolve, reject) => {
      window.asyncStorage.setItem('localRemoteRevisions',
                                  this._localRemoteRevisions, resolve, reject);
    });
  },

  _addToLocalRemoteRevisions: function(localRevId, remoteRevId) {
    return this._retrieveLocalRemoteRevisions(true).then(() => {
      this._localRemoteRevisions = this._localRemoteRevisions ||
                                                          Object.create(null);
      this._localRemoteRevisions[localRevId] = remoteRevId;
      return this._saveLocalRemoteRevisions();
    });
  },

  _addToRevisionGraph: function(oldRev, newRev) {
    return this._retrieveRevisionGraph(true).then(() => {
      this._revisionGraph = this._revisionGraph || Object.create(null);
      this._revisionGraph[newRev] = oldRev;
      return this._saveRevisionGraph();
    });
  },

  get revisionId() {
    var localRevId = this._localDatastore.revisionId;
    var remoteRevision;
    while (!remoteRevision && localRevId) {
      remoteRevision = this._localRemoteRevisions[localRevId];
      localRevId = this._revisionGraph[localRevId];
    }

    if (!localRevId && !remoteRevision) {
      return 0;
    }

    return remoteRevision;
  },

  _clearMetadata: function() {
    var operations = [];
    operations.push(this._clearIds());
    operations.push(this._clearBlobData());
    operations.push(this._clearRevisionMetadata());

    return Promise.all(operations);
  },

  _clearBlobData: function() {
    // TODO: We keep the blob map as it was
    // this._objectBlob = null;
    return this._saveBlobData();
  },

  _clearRevisionMetadata: function() {
    this._localRemoteRevisions = null;
    this._revisionGraph = null;

    return new Promise(function(resolve, reject) {
      window.asyncStorage.removeItem('revisionGraph', function done() {
        window.asyncStorage.removeItem('localRemoteRevisions', resolve, reject);
      });
    });
  },

  // Returns all the ids
  getAll: function() {
    return new Promise(function(resolve, reject) {
      window.asyncStorage.getItem('dataStoreIds', resolve, reject);
    });
  },

  // For the moment we only support full sync
  sync: function(pnewRev) {
    var newRev = typeof pnewRev === 'undefined' ? Number.MAX_VALUE : pnewRev;

    return new Promise((resolve, reject) => {
      this._retrieveRevisionMetadata().then(() => {
        var revisionId = this.revisionId;

        console.log('Current Remote Revision Id: ', revisionId);

        if (revisionId !== 0 && revisionId < newRev) {
          Rest.get(SERVICE_URL + '/' + this._localDatastore.name + '/' +
          'sync/from' + '?token=' + this._token + '&revisionId=' + revisionId, {
            success: (syncData) => {
              if (syncData.newRevisionId == revisionId) {
                console.log('No changes since last revision!!!!');
                resolve(null);
                return;
              }
              var syncSuccess = () => {
                console.log('NEW REV ID: ', syncData.newRevisionId);
                var newLocalRevId = this._localDatastore.revisionId;
                console.log('NEW LOCAL REV ID: ', newLocalRevId);
                this._addToLocalRemoteRevisions(newLocalRevId,
                                                    syncData.newRevisionId).
                    then(resolve, reject);
              };
              this._doSync(syncData, syncSuccess, reject);
            },
            error: () => console.error('Error syncing: '),
            timeout: () => console.error('Timeout syncing: ')
          },
          {
            operationsTimeout: 10000
          });
          return;
        }
        else if (revisionId === 0) {
          Rest.get(SERVICE_URL + '/' + this._localDatastore.name + '/' +
          'sync/get_all' + '?token=' + this._token, {
            success: (syncData) => {
              console.log('Succesfully obtained the data remotely: ',
                          syncData.newRevisionId);
              var syncSuccess = () => {
                // alert('NEW REV ID: ' + syncData.newRevisionId);
                console.log('NEW REV ID: ', syncData.newRevisionId);
                var newLocalRevId = this._localDatastore.revisionId;
                console.log('NEW LOCAL REV ID: ', newLocalRevId);
                this._addToLocalRemoteRevisions(newLocalRevId,
                                                    syncData.newRevisionId).
                    then(resolve, reject);
              };
              this._doSync(syncData, syncSuccess, reject);
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
        }
        else {
          console.log('New version provided is already known');
          resolve(null);
          return;
        }
      });
    });
  },

  _doSync: function(syncData, resolve, reject) {
    var operations = [];

    var updatedData = syncData.updatedData;
    var removedData = syncData.removedData;

    var objectData = updatedData.objectData;
    var mediaInfo = updatedData.mediaInfo;

    var precondition = Promise.resolve();

    if (syncData.cleared) {
      console.log('Is clear!!!!!!!!!');
      precondition = this.clear({
        onlyLocal: true
      });
    }

    precondition.then(() => {
      for(var prop in objectData) {
        var obj = objectData[prop];
        var id = Number(prop);
        console.log('Obj obtained: ', id, obj.title);
        operations.push(this.put(obj, id, {
          onlyLocal: true
        }));
      }

      var removeOperations = [];
      for(var j = 0; j < removedData.length; j++) {
        removeOperations.push(this.remove(Number(removedData[j]), {
          onlyLocal: true
        }));
      }

      Promise.all(removeOperations).then(() => {
        return Promise.all(operations);
      }).then((addedIds) => {
        console.log('Add operations result: ', addedIds);
        // Now we need to get all the media
        if (!mediaInfo) {
          resolve();
          return;
        }

        var mediaList = Object.keys(mediaInfo);
        if (mediaList.length === 0) {
          resolve();
          return;
        }

        var mediaOperations = [];
        var mediaSync = new MediaSynchronizer(this._token,
                                  this._localDatastore.name, mediaList);
        mediaSync.start();

        var hashOperations = [];

        mediaSync.onmediaready = (id, blob) => {
          if (!blob) {
            console.warn('No blob could be retrieved for: ', id);
            return;
          }
          // Once the blob is ready it has to be persisted in the local
          // database
          var objectId = mediaInfo[id].objId;
          var objectProperty = mediaInfo[id].objProp;

          // The blob data map has to be updated (TODO)

          var object = objectData[objectId];
          object[objectProperty] = blob;
          // Here we update the corresponding object
          mediaOperations.push(this.put(object, Number(objectId), {
            onlyLocal: true
          }));
        };

        mediaSync.onfinish = () => {
          Promise.all(mediaOperations).then(() => {
            resolve();
          });
        }
      }, reject);
    });
  },

  _removeId: function(id) {
    return new Promise(function(resolve, reject) {
      asyncStorage.getItem('dataStoreIds', function onListReady(list) {
        var newList = list.slice(0, list.length);

        var index = newList.indexOf(id);
        if (index === -1) {
          reject('not found');
          return;
        }
        newList.splice(index, 1);

        asyncStorage.setItem('dataStoreIds', newList, resolve, reject);
      });
    });
  },

  _addId: function (id) {
    return new Promise(function(resolve, reject) {
      asyncStorage.getItem('dataStoreIds', function onListReady(list) {
        var newList = list || [];
        if(newList.indexOf(id) !== -1) {
          resolve(id);
          return;
        }
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

  _getLastSyncedLocalRev: function(lastLocalRev) {
    var out;
    var currentLocalRev = lastLocalRev;
    var remoteRev;

    while(!remoteRev && currentLocalRev) {
      currentLocalRev = this._revisionGraph[currentLocalRev];
      remoteRev = this._localRemoteRevisions[currentLocalRev];
    }

    if (remoteRev && currentLocalRev) {
      out = currentLocalRev;
    }

    return out;
  },

  handleOnline: function(e) {
    console.log('Online changed ...', navigator.onLine);
    if (navigator.onLine === true) {
      // If there are pending operations to be executed against the server
      // We execute them
      var currentLocalRevId = this._localDatastore.revisionId;
      console.log('Current Local Rev Id: ', currentLocalRevId);
      this._retrieveRevisionMetadata().then(() => {
        console.log(JSON.stringify(this._localRemoteRevisions));
        console.log(JSON.stringify(this._revisionGraph));

        var remoteRevId = this._localRemoteRevisions[currentLocalRevId];
        // alert(JSON.stringify(this._localRemoteRevisions));
        if (!remoteRevId) {
          var lastSyncedRevision = this._getLastSyncedLocalRev(
                                                            currentLocalRevId);

          var cursor = this._localDatastore.sync(lastSyncedRevision);

          var changeHandler = (task) => {
            if (task.operation === 'done') {
              return;
            }

            console.log('Found a task to handle: ', task.operation);
            task.type = 'change';
            this.handleEvent({
              type: 'change',
              revisionId: task.revisionId,
              operation: task.operation,
              id: task.id
            });

            cursor.next().then(changeHandler);
          };
          cursor.next().then(changeHandler);
        }
      });
    }
  },

  handleEvent: function(e) {
    var self = this;

    if (e.type === 'online' || e.type === 'offline') {
      this.handleOnline(e);
      return;
    }

    if (e.type !== 'change') {
      return;
    }

    if (this._isLocalOperation === true) {
      console.log('It is a local operation ....');
      return;
    }

    console.log('Event listener: ', e.type, e.id, e.operation);

    var affectedKey = e.id;
    var operation = e.operation;
    var revisionId = e.revisionId;

    if (navigator.onLine === false) {
      console.log('Navigator is not online ... nothing can be done');
      return;
    }

    // And now execute the operation against the cloud
    switch (operation) {
      case 'added':
      case 'add':
        this._localDatastore.get(affectedKey).then((obj) => {
          return this._getData(obj, affectedKey);
        }).then((adaptedObj) => {
          RestPost(SERVICE_URL + '/' + self._localDatastore.name
                + '/' +  affectedKey + '?token=' + self._token, adaptedObj, {
                  method: 'PUT'
                },{
             success: (response) => {
              var revId = revisionId || this._localDatastore.revisionId;
              this._addToLocalRemoteRevisions(revId,  response.revisionId);
              console.log('Succesfully added to the service: ', affectedKey,
                          response.revisionId);
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
      case 'put':
      case 'update':
        this._localDatastore.get(affectedKey).then((obj) => {
          return this._getData(obj, affectedKey);
        }).then((adaptedObj) => {
          RestPost(SERVICE_URL + '/' + self._localDatastore.name
                + '/' + affectedKey + '?token=' + self._token, adaptedObj, {
                method: 'POST'
            },{
            success: (response) => {
              this._addToLocalRemoteRevisions(revisionId,  response.revisionId);
              console.log('Succesfully updated remotely: ', affectedKey,
                          response.revisionId)
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
      case 'remove':
        console.log('REMOVED!!!!');
        RestPost(SERVICE_URL + '/' + self._localDatastore.name
                   + '/' + affectedKey + '?token=' + self._token, null, {
                    method: 'DELETE',
                    operationsTimeout: 10000
              }, {
                  success: (response) => {
                    this._addToLocalRemoteRevisions(revisionId,
                                                    response.revisionId);
                    console.log('Succesfully removed remotely: ', affectedKey,
                                response.revisionId);
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
      case 'clear':
        this._objectBlob = null;
        this._saveBlobData();
        Rest.get(SERVICE_URL + '/' + self._localDatastore.name + '/' +
                 encodeURIComponent('__all__') + '?token=' + self._token,
          {
             success: (response) => {
              this._addToLocalRemoteRevisions(revisionId,  response.revisionId);
              console.log('Succesfully cleared remotely', response.revisionId);
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
