// Copyright (c) 2014 Telefónica I+D S.A.U.

'use strict';

var fs = require('fs');
var http = require('http');
var URL = require('url');
var QueryString = require('querystring');

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

function getRevisionId(token, dsName, cb) {
}

function incrementRevisionId(token, dsName, cb) {

}

function getChanges(token, dsName, lastRevisionId, cb) {

}

function getFromDatastore(params, cb) {
  console.log(params.id);
  var hashName = getHashName(params);
  console.log(hashName);
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
function putToDatastore(params, object, cb) {
  var hashName = getHashName(params);
  client.hset(hashName, params.id, JSON.stringify(object), cb);
}

// If the is an existing object with the same id error
function addToDatastore(params, object, cb) {
  var hashName = getHashName(params);
  client.hexists(hashName, params.id, function(err, result) {
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

    putToDatastore(params, object, cb);
  });
}

function deleteFromDatastore(params, cb) {
  var hashName = getHashName(params);
  client.hdel(hashName, params.id, function(err, result) {
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

// Add data to the datastore (add)
app.put('/dsapi/:dsname/:id', function(req, resp) {
  var params = getParams(req);
  var obj = getObjectFromRequest(req);

  console.log('In datastore add', JSON.stringify(params), obj);

  if (!params || !obj) {
    resp.send(404);
    return;
  }

  addToDatastore(params, JSON.parse(obj), function(error, result) {
    if (error) {
      resp.send(500);
      return;
    }

    resp.send('ok');
  });
});


// Put data on the datastore (update)
app.post('/dsapi/:dsname/:id', function(req, resp) {
  var params = getParams(req);
  var obj = getObjectFromRequest(req);

  console.log('In datastore put', JSON.stringify(params), obj);

  if (!params || !obj) {
    resp.send(404);
    return;
  }

  putToDatastore(params, JSON.parse(obj), function(error, result) {
    if (error) {
      resp.send(500);
      return;
    }

    resp.send('ok');
  });
});

// Delete from datastore
app.delete('/dsapi/:dsname/:id', function(req, resp) {
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

  deleteFromDatastore(params, function(err, result) {
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
