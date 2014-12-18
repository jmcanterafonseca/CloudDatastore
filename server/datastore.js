'use strict';

var Utils = require('./utils');
var Async = require('async');
var redis = require('redis'),
    client = redis.createClient();

var Storage = require('./storage');

var REVISIONS_HASH = 'revisions';

// Returns the current revision Id for the remote data
function getRevisionId(clientId, dsName, cb) {
  var revisionKeyName = Utils.getRevisionIdKey(clientId, dsName);
  client.hget(REVISIONS_HASH, revisionKeyName, cb);
}

function incrementRevisionId(token, clientId, dsName, aChange, cb) {
  var revisionKeyName = Utils.getRevisionIdKey(clientId, dsName);
  client.hincrby(REVISIONS_HASH, revisionKeyName, 1, function(err, newRevId) {
    if (err) {
      cb(err);
      return;
    }
    var hrevName = Utils.getRevisionsHashName(clientId, dsName);
    client.hset(hrevName, newRevId, JSON.stringify(aChange), function(err, res) {
      if (err) {
        cb(err);
        return;
      }
      cb(null, newRevId);

      Utils.notifyChanges(clientId, token, newRevId, function() {});
    });
  });
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
function putToDatastore(params, object, id, cb, options) {
  console.log('Put to datastore ...');

  var operation = options && options.isAdd === true ? 'add' : 'put';

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

      client.hset(hashName, id, JSON.stringify(object), function(error, result) {
        if (error) {
          cb(error, null);
          return;
        }

        var changeList = [{
          operation: operation,
          id: id
        }];

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
                changeList.push({
                  operation: 'removeMedia',
                  id: id,
                  mediaId: mediaId,
                  propertyName: prop
                });
              }
            }
          }

          if (operations.length === 0) {
            incrementRevisionId(params.token, clientId, params.datastoreName,
                                  changeList, cb);
            return;
          }

          Async.series(operations, function(err, results) {
            if (err) {
              console.error('Error while uploading media: ', err);
              return;
            }
            console.log('Result of uploading media: ', results);
            results.forEach(function(aResult, index) {
              if (aResult === 1) {
                changeList.push({
                  operation: 'putMedia',
                  id: id,
                  mediaId: mediaIds[index],
                  propertyName: prop
                });
              }
            });
            incrementRevisionId(params.token, clientId, params.datastoreName,
                                changeList, cb);
          });


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
  console.log('Add to datastore');

  Utils.getHashName(params, function(err, hashName) {
    console.log('Token: ', params.token);
    if (err) {
      cb(err);
      console.error('Error obtaining hash name: ', err);
      return;
    }
    id = params.id || id;

    client.hexists(hashName, id, function(err, result) {
      if (err) {
        cb(err);
        return;
      }

      if (result === 1) {
        cb({
            name: 'AlreadyExists'
        }, null);
        return;
      }

      putToDatastore(params, object, id, cb, {
        isAdd: true
      });
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

        var changeList = [{
          operation: 'remove',
          id: id
        }];
        incrementRevisionId(params.token, clientId, params.datastoreName,
                            changeList, cb);

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
    var dsName = params.datastoreName;
    Storage.deleteBucket(clientId, dsName , function(err, res) {
      client.del(hashName, function(err, result) {
        if (err) {
          cb(err);
          return;
        }
        var revHashName = Utils.getRevisionsHashName(clientId, dsName);
        // What happened before we do not care anymore
        client.del(revHashName, function(err, result) {
          if (err) {
            console.error('Error deleting revisions: ', err);
          }
          var changeList = [{
            operation: 'clear'
          }];
          incrementRevisionId(params.token, clientId, params.datastoreName,
                              changeList, cb);
        });
      });

    });
  });
}

function getAll(params, cb) {
  Utils.getHashName(params, function(err, hashName, clientId) {
    if (err) {
      cb(err);
      return;
    }

    var dsName = params.datastoreName;

    client.hgetall(hashName, function(error, result) {
      if (error) {
        cb(error);
        return;
      }
      var out = Object.create(null);

      if (result) {
        //code
        Object.keys(result).forEach(function(aKey) {
          out[aKey] = JSON.parse(result[aKey]);
        });
      }

      getRevisionId(clientId, dsName, function(err, currentRevId) {
        if (err) {
          cb(err);
          return;
        }
        cb(null, {
          newRevisionId: currentRevId,
          data: out
        });
      });
    });
  });
}

function sync(params, cb) {
  // We need to determine the changes
  var revisionId = Number(params.revisionId);

  Utils.getHashName(params, function(err, hashName, clientId) {
    if (err) {
      cb(err);
      return;
    }

    var dsName = params.datastoreName;

    getRevisionId(clientId, dsName, function(err, currentRevId) {
      if (err) {
        cb(err);
        return;
      }

      if (currentRevId == revisionId) {
        cb(null, {
          newRevisionId: currentRevId,
          updatedData: Object.create(null),
          removedData: []
        });
        return;
      }

      var revHashName = Utils.getRevisionsHashName(clientId, dsName);
      // Now we need to get all the changes
      var operations = [];
      for(var j = revisionId + 1; j <= currentRevId; j++) {
        console.log('Rev: ', j);
        operations.push(client.hget.bind(client, revHashName, j));
      }

      var objAddedHash = Object.create(null);
      var objUpdatedHash = Object.create(null);
      var objHash = Object.create(null);
      var mediaHash = Object.create(null);
      var removedObjHash = Object.create(null);

      var cleared = false;

      Async.parallel(operations, function(err, changeList) {
        changeList.forEach(function(aChangeList) {
          if (!aChangeList) {
            return;
          }
          var changeListArray = JSON.parse(aChangeList);
          changeListArray.forEach(function(aChange) {
            switch(aChange.operation) {
              case 'put':
                objUpdatedHash[aChange.id] = true;
                objHash[aChange.id] = true;
              break;

              case 'add':
                objAddedHash[aChange.id] = true;
                objHash[aChange.id] = true;
                break;

              case'putMedia':
                mediaHash[aChange.mediaId] = aChange.propertyName;
              break;

              case 'removeMedia':
                delete mediaHash[aChange.mediaId];
              break;

              case 'remove':
                // If it was not previously known there is no point in sending
                // this 'remove' change
                if (!objAddedHash[aChange.id]) {
                  removedObjHash[aChange.id] = true;
                }
                delete objAddedHash[aChange.id];
                delete objUpdatedHash[aChange.id];
                delete objHash[aChange.id];
              break;

              case 'clear':
                objAddedHash = Object.create(null);
                objUpdatedHash = Object.create(null);
                objHash = Object.create(null);
                mediaHash = Object.create(null);

                cleared = true;
              break;
            }
          });
        });

        var objList = Object.keys(objHash);
        if (objList.length === 0) {
          cb(null, {
            newRevisionId: currentRevId,
            updatedData: Object.create(null),
            removedData: Object.keys(removedObjHash),
            media: mediaHash,
            cleared: cleared
          });
          return;
        }

        multipleGet(params, objList, function(err, res) {
          cb(null, {
            newRevisionId: currentRevId,
            updatedData: res,
            removedData: Object.keys(removedObjHash),
            media: mediaHash,
            cleared: cleared
          });
        });
      });
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

      var parsedResult = Object.create(null);

      result.forEach(function(aItem, index) {
        var obj = JSON.parse(aItem);
        parsedResult[idList[index]] = obj;
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
exports.getAll = getAll;
exports.getRevisionId = getRevisionId;
exports.sync = sync;
