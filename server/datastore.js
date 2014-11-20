'use strict';

var Utils = require('./utils');
var Async = require('async');
var redis = require('redis'),
    client = redis.createClient();

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
  var hashName = Utils.getHashName(params);
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
}


// The object is set (overwritten if already exists)
function putToDatastore(params, object, id, cb) {
  var hashName = Utils.getHashName(params);
  id = params.id || id;
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

    for(var prop in object) {
      var value = object[prop];
      if (value.indexOf('blob:') === 0) {
        var metadata = {
          fileName: getBlobId(value)
        };
        Storage.createBucketForDatastore(params.token, params.datastoreName,
                                         function(error, result) {
          console.log('Going to upload media ...');
          Storage.uploadMedia(params.token, params.datastoreName,
                              params.req, metadata, cb);
        });
      }
    }
  });
}

// If the is an existing object with the same id error
function addToDatastore(params, object, id, cb) {
  var hashName = Utils.getHashName(params);
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
}

function deleteFromDatastore(params, id, cb) {
  var hashName = Utils.getHashName(params);
  id = params.id || id;

  client.hdel(hashName, id, function(err, result) {
    if (err) {
     cb(err, null);
     return;
    }
    if (result === 0) {
      cb({
          name: 'NotFound'
      }, null);
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
  });
}

function clearDatastore(params, cb) {
  var hashName = Utils.getHashName(params);
  client.del(hashName, cb);
}

function multipleGet(params, idList, cb) {
  var hashName = Utils.getHashName(params);
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

  var hashName = getHashName(params);
  var serializedObjs = {};
  objectList.forEach(function(aObj) {
    serializedObjs[aObj.id] = JSON.stringify(aObj.object);
  });
  client.hmset(hashName, serializedObjs, cb);
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
