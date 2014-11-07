// Copyright (c) 2014 Telefónica I+D S.A.U.

'use strict';

var fs = require('fs');
var http = require('http');
var URL = require('url');
var QueryString = require('querystring');
var Async = require('async');
var Storage = require('./storage');

var redis = require('redis'),
    client = redis.createClient();

var loggerStream = fs.createWriteStream('./log.txt', {
  flags: 'a',
  encoding: 'utf-8',
  mode: '0666'
});

var express = require('express');
var app = express();

app.configure(function() {
  app.use(express.logger({format: 'dev', stream: loggerStream}));
  app.use(express.bodyParser());
});

var httpServer = http.createServer(app);
httpServer.listen(80);

console.log('CloudDatastore server up and running');

function getHashName(params) {
  return params.token + '_' + params.datastoreName;
}

var REVISIONID_KEY = 'revisionId';
function getRevisionHashName(params) {
  return getHashName(params) + '_' + 'revisions';
}

function getRevisionIdKey(token, dsName) {
  return REVISIONID_KEY + '_' + token + '_' + dsName;
}

// Returns the current revision Id for the remote data
function getRevisionId(token, dsName, cb) {
  var params = {
    token: token,
    datastoreName: dsName
  };
  var revisionKeyName = getRevisionIdKey(token, dsName);
  client.get(revisionKeyName, cb);
}

function incrementRevisionId(token, dsName, cb) {
  var params = {
    token: token,
    datastoreName: dsName
  };
  var revisionKeyName = getRevisionIdKey(token, dsName);
  client.incr(revisionKeyName, cb);
}

var CHANGES_KEY = 'revisionChanges';
function getChangesKey(revisionId) {
  return CHANGES_KEY + '_' + revisionId;
}

// Obtains the changes since the (local) revisionId passed as parameter
function getChanges(params, lastRevisionId, cb) {
  var revisionHashName = getRevisionHashName(params);
  var key = getChangesKey(revisionId);
  client.hget(revisionHashName, key, cb);
}

function setChanges(params, changesObject, cb) {
  var revisionHashName = getRevisionHashName(params);
  var key = getChangesKey(revisionId);
  client.hset(revisionHashName, key, changesObject, cb);
}

// Sets the correspondence between local and remote revisionIds
function setLocalRemoteRevisionId(params, localRevisionId, cb) {

}

function getFromDatastore(params, cb) {
  var hashName = getHashName(params);
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

function getBlobId(url) {
  // Ensure it starts with a letter
  var val = 'd' + '_' + url.substring(url.indexOf(':') + 1);
  return val.replace(/-/g, '_');
}

// The object is set (overwritten if already exists)
function putToDatastore(params, object, id, cb) {
  var hashName = getHashName(params);
  id = params.id || id;
  client.hset(hashName, id, JSON.stringify(object), function(error, result) {
    if (error) {
      cb(error, null);
      return;
    }

    /*
    setChanges(params, {
      operation: 'update',
      id: id
    }, function(error, cb) {

    }); */

    for(var prop in object) {
      var value = object[prop];
      if (value.startsWith('blob:')) {
        var metadata = {
          fileName: getBlobId(value),
        };
        Storage.createBucketForUser(params.token, function(error, result) {
          Storage.uploadMedia(params.token, metadata, params.req, cb);
        });
      }
    }
  });
}

// If the is an existing object with the same id error
function addToDatastore(params, object, id, cb) {
  var hashName = getHashName(params);
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
  var hashName = getHashName(params);
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
  var hashName = getHashName(params);
  client.del(hashName, cb);
}

function getParams(req) {
  var params = req.params;
  var url = URL.parse(req.originalUrl);
  var queryParams = QueryString.parse(url.query);

  if (!queryParams.token || !params.dsname || !params.id) {
    return null;
  }

  return {
    token: queryParams.token,
    datastoreName: params.dsname,
    id: params.id
  }
}

function getObjectFromRequest(req) {
  return req.body.object;
}

function multipleGet(params, idList, cb) {
  var hashName = getHashName(params);
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

function processBulkRequest(params, object, cb) {
  var getOperations = object.getOps;
  var addOperations = object.addOps;
  var putOperations = object.putOps;
  var delOperations = object.delOps;

  Async.series([
    multipleGet.bind(null, params, getOperations),
    multipleAdd.bind(null, params, addOperations),
    multiplePut.bind(null, params, putOperations),
    multipleDelete.bind(null, params, delOperations)
  ], function(err, result) {
      console.log('Results: ', result);
      cb(err, result);
  });
}

// Get an object from the datastore by id
app.get('/dsapi/:dsname/:id', function(req, resp) {
  var params = getParams(req);
  if (!params) {
    resp.send(404);
    return;
  }

  getFromDatastore(params, function(error, result) {
    if (error) {
      resp.send(500);
      return;
    }

    if (!result) {
      resp.send(404);
      return;
    }

    resp.type('json');
    resp.set('Expires', 'Thu, 15 Apr 2010 20:00:00 GMT');
    resp.send(result);
  });
});

// Gets all the data the datastore has (typically used to bootstrap)
app.get('/dsapi/:dsname/getAll', function(req, resp) {
  var params = getParams(req);
  var hashName = getHashName(params);
  client.hgetall(hashName, function(error, result) {
    if (error) {
      cb(null, error);
      return;
    }
    var out = {};
    for(var j = 0; j < result.length / 2; j+=2) {
      var key = result[j];
      var object = result[j + 1];
      out[key] = JSON.parse(object);
    }

    resp.type('json');
    resp.set('Expires', 'Thu, 15 Apr 2010 20:00:00 GMT');
    resp.send(out);
  });
});

// Bulk operation that allows to obtain a change list
// sync last revisionId
app.get('/dsapi/:dsname/bulk_sync', function(req, resp) {

});

// Bulk operation that allows to sync changes to the remote datastore
app.post('/dsapi/:dsname/:revisionId/bulk_sync', function(req, resp) {
  var reqParams = req.params;
  var url = URL.parse(req.originalUrl);
  var queryParams = QueryString.parse(url.query);

  var params = {
    datastoreName: reqParams.dsname,
    token: queryParams.token
  };

  if (!params.token) {
    resp.send(404);
    return;
  }

  var obj = getObjectFromRequest(req);

  if (!obj) {
    resp.send(404);
    return;
  }

  console.log('Process bulk request');
  processBulkRequest(params, JSON.parse(obj), function(error, result) {
    console.log('Error: ', error);
    if (error) {
      resp.send(500);
      return;
    }

    console.log('Bulk Request result: ', result.length);
    resp.type('json');
    resp.set('Expires', 'Thu, 15 Apr 2010 20:00:00 GMT');
    resp.send(result);

  });
});

// Add data to the datastore (add)
app.put('/dsapi/:dsname/:revisionId/:id', function(req, resp) {
  var params = getParams(req);
  var obj = getObjectFromRequest(req);

  if (!params || !obj) {
    resp.send(404);
    return;
  }

  addToDatastore(params, JSON.parse(obj), null, function(error, result) {
    if (error) {
      resp.send(500);
      return;
    }

    resp.send('ok');
  });
});


// Put data on the datastore (update)
app.post('/dsapi/:dsname/:revisionId/:id', function(req, resp) {
  var params = getParams(req);
  var obj = getObjectFromRequest(req);

  if (!params || !obj) {
    resp.send(404);
    return;
  }

  putToDatastore(params, JSON.parse(obj), null, function(error, result) {
    if (error) {
      resp.send(500);
      return;
    }

    resp.send('ok');
  });
});

// Delete from datastore
app.delete('/dsapi/:dsname/:revisionId/id', function(req, resp) {
  var params = getParams(req);
  if (!params) {
    resp.send(404);
    return;
  }

  if (params.id === '__all__') {
    console.log('Clear datastore');
    clearDatastore(params, function(err, result) {
      if (err) {
        resp.send(500);
        return;
      }
      if (result === 1) {
        resp.send('ok');
      }
      else {
        resp.send(404);
      }
    });

    return;
  }

  deleteFromDatastore(params, null, function(err, result) {
    if (err) {
      resp.send(500);
      return;
    }

    if (result !== 'ok') {
      resp.send(404);
      return;
    }

    resp.send(200);
  });
});

// Get the revisionId of the datastore
app.get('/dsapi/:dsname/revisionId', function(req, resp) {

});

// Set the revisionId of the datastore
app.post('/dsapi/:dsname/revisionId', function(req, resp) {

});

// Lists the known datastores
app.get('/dsapi/listds', function(req, resp) {

});

// Sync with this datastore (sync the last known revisionId)
app.get('dsapi/sync', function(req, resp) {

});
