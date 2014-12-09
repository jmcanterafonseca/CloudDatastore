'use strict';

var Utils = require('./utils');
var Async = require('async');
var redis = require('redis'),
    client = redis.createClient();

var Storage = require('./storage');

// Returns the current revision Id for the remote data
function getRevisionId(token, dsName, cb) {
  var params = {
    token: token,
    datastoreName: dsName
  };
  var revisionKeyName = Utils.getRevisionIdKey(token, dsName);
  client.get(revisionKeyName, cb);
}

function incrementRevisionId(token, dsName, cb) {
  var params = {
    token: token,
    datastoreName: dsName
  };
  var revisionKeyName = Utils.getRevisionIdKey(token, dsName);
  client.incr(revisionKeyName, cb);
}

var CHANGES_KEY = 'revisionChanges';
function getChangesKey(revisionId) {
  return CHANGES_KEY + '_' + revisionId;
}

// Obtains the changes since the (local) revisionId passed as parameter
function getChanges(params, lastRevisionId, cb) {
  var revisionHashName = Utils.getRevisionHashName(params);
  var key = getChangesKey(revisionId);
  client.hget(revisionHashName, key, cb);
}

function setChanges(params, changesObject, cb) {
  var revisionHashName = Utils.getRevisionHashName(params);
  var key = Utils.getChangesKey(revisionId);
  client.hset(revisionHashName, key, changesObject, cb);
}

// Sets the correspondence between local and remote revisionIds
function setLocalRemoteRevisionId(params, localRevisionId, cb) {

}

function getFromDatastore(params, cb) {
  Utils.getHashName(params, function(err, hashName) {
    if (err) {
      cb(err, null);
      return;
    }
    client.hget(hashName, params.id, function(error, result) {
      if (error) {
        cb(error, null);
        return;
      }

      var out = null;
      if (result) {
        out = JSON.parse(result)
      }

      cb(null, out);
    });
  });
}

// Only media is stored if was not previously stored
function uploadMedia(clientId, dsName, req, metadata, cb) {
  Utils.isMediaStored(metadata.fileName, function(err, res) {
    if (err) {
      cb(err);
      return;
    }
    if (res === true) {
      cb(null, 'already stored');
      return;
    }

    Storage.uploadMedia(clientId, dsName, req, metadata, function(err, res) {
      if (err) {
        console.error(err);
        cb(err);
        return;
      }
      Utils.addMediaStored(metadata.fileName, cb);
    });
  });
}

function deleteMedia(clientId, dsName, mediaId, cb) {
  Storage.deleteMedia(clientId, dsName, mediaId, function(err, result) {
    if (err) {
      console.error(err);
      cb(err);
      return;
    }
    Utils.deleteMediaStored(mediaId, cb);
  });
}

// The object is set (overwritten if already exists)
function putToDatastore(params, object, id, cb) {
  Utils.getHashName(params, function(err, hashName, clientId) {
    if (err) {
      cb(err, null);
      return;
    }

    id = params.id || id;
    client.hget(hashName, id, function(error, result) {
      var originalObject;
      if (result) {
        originalObject = JSON.parse(result);
      }
      else {
        originalObject = Object.create(null);
      }
      console.log('Original object: ', originalObject);

      client.hset(hashName, id, JSON.stringify(object), function(error, result) {
        if (error) {
          cb(error, null);
          return;
        }

        cb();

        /*
        setChanges(params, {
          operation: 'update',
          id: id
        }, function(error, cb) {

        }); */
        var dsName = params.datastoreName;
        Storage.createBucketForDatastore(clientId, dsName, function(err, res) {
          var operations = [], mediaIds = [], toBeRemoved = [];

          for(var prop in object) {
            var value = object[prop];
            if (value.indexOf('blob:') === 0) {
              var metadata = {
                fileName: Utils.getBlobId(value)
              };

              // The uploadMedia function  will take care not to upload
              // what it is not needed to upload
              console.log('Going to upload media ...', metadata.fileName);
              mediaIds.push(metadata.fileName);
              operations.push(uploadMedia.bind(null, clientId, dsName,
                                  params.req, metadata));
            }
          }

          // Here we are detecting the media that were removed
          for(var prop in originalObject) {
            var originalValue = originalObject[prop];
            var value = object[prop];
            if (originalValue && originalValue.indexOf('blob:') === 0) {
              if (originalValue !== value) {
                var mediaId = Utils.getBlobId(originalValue);
                toBeRemoved.push(deleteMedia.bind(null, clientId, dsName,
                                                  mediaId));
              }
            }
          }

          if (operations.length > 0) {
            Async.series(operations, function(err, result) {
              if (err) {
                console.error('Error while uploading media: ', err);
                return;
              }
              console.log('Result of uploading media: ', result)
            });
          }

          if (toBeRemoved.length > 0) {
            Async.series(toBeRemoved, function(err, result) {
              if (err) {
                console.error('Error while deleting media: ', err);
                return;
              }
              console.log('Result of deleting media: ', result)
            });
          }
        });
      });
    });
  });
}

// If the is an existing object with the same id error
function addToDatastore(params, object, id, cb) {
  Utils.getHashName(params, function(err, hashName) {
    if (err) {
      cb(err, null);
      return;
    }
    id = params.id || id;

    client.hexists(hashName, id, function(err, result) {
      if (err) {
        cb(err, null);
        return;
      }

      if (result === 1) {
        cb({
            name: 'AlreadyExists'
        }, null);
        return;
      }

      putToDatastore(params, object, id, cb);
    });
  });
}

function deleteFromDatastore(params, id, cb) {
  var dsName = params.datastoreName;

  Utils.getHashName(params, function(err, hashName, clientId) {
    if (err) {
      cb(err);
      return;
    }
    id = params.id || id;

    client.hget(hashName, id, function(error, result) {
      var originalObject;
      if (result) {
        originalObject = JSON.parse(result);
      }
      else {
        originalObject = Object.create(null);
      }
      console.log('Original object: ', originalObject);


      client.hdel(hashName, id, function(err, result) {
        if (err) {
         cb(err);
         return;
        }
        if (result === 0) {
          cb({
              name: 'NotFound'
          });
          return;
        }
        /*
        setChanges(params, {
          operation: 'delete',
          id: id
        }, function(error, cb) {

        });
        */
        cb(null, 'ok');

        var deleteOperations = [];
        // It is needed to delete the blobs from the storage
        for(var prop in originalObject) {
          var originalValue = originalObject[prop];
          if (originalValue.indexOf('blob:') === 0) {
            var mediaId = Utils.getBlobId(originalValue);
            deleteOperations.push(deleteMedia.bind(null, clientId, dsName,
                                                   mediaId));
          }
        }

        if (deleteOperations.length > 0) {
          Async.series(deleteOperations, function(err, result) {
            if (err) {
              console.error('Error deleting media: ', err);
              return;
            }
            console.log('Result of deleting media: ', result);
          });
        }
      });
    });
  });
}

function clearDatastore(params, cb) {
  Utils.getHashName(params, function(err, hashName, clientId) {
    if (err) {
      cb(err);
      return;
    }
    Storage.deleteBucket(clientId, params.datastoreName, function(err, res) {
      client.del(hashName, cb);
    });
  });
}

function multipleGet(params, idList, cb) {
  Utils.getHashName(params, function(err, hashName) {
    if (err) {
      cb(err, null);
      return;
    }
    client.hmget(hashName, idList, function(error, result) {
      if (error) {
        cb(error);
        return;
      }

      var parsedResult = [];

      result.forEach(function(aItem) {
        var obj = JSON.parse(aItem);
        parsedResult.push(obj);
      });

      cb(null, parsedResult);
    });
  });
}

function multipleAdd(params, objectList, cb) {
  if (!Array.isArray(objectList)) {
    cb(null, null);
    return;
  }
  var functions = [];
  objectList.forEach(function(aObj) {
    functions.push(addToDatastore.bind(null, params, aObj.object, aObj.id));
  });

  Async.parallel(functions, function(err, result) {
    console.log('Result multiple add: ', result);
    cb(err, result);
  });
}

function multiplePut(params, objectList, cb) {
  if (!Array.isArray(objectList)) {
    cb(null, null);
    return;
  }

  Utils.getHashName(params, function(err, hashName) {
    if (err) {
      cb(err);
      return;
    }

    var serializedObjs = {};
    objectList.forEach(function(aObj) {
      serializedObjs[aObj.id] = JSON.stringify(aObj.object);
    });
    client.hmset(hashName, serializedObjs, cb);
  });
}

function multipleDelete(params, idList, cb) {
  if (!Array.isArray(idList)) {
    cb(null, null);
    return;
  }

  console.log('Multiple delete: ', idList);

  var functions = [];
  idList.forEach(function(id) {
    functions.push(deleteFromDatastore.bind(null, params, id));
  });

  Async.parallel(functions, function(err, result) {
    console.log('Result multiple delete: ', result);
    cb(err, result);
  });
}

exports.clearDatastore   = clearDatastore;
exports.addToDatastore   = addToDatastore;
exports.putToDatastore   = putToDatastore;
exports.getFromDatastore = getFromDatastore;
exports.deleteFromDatastore = deleteFromDatastore;
