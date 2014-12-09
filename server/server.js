// Copyright (c) 2014 Telefónica I+D S.A.U.

'use strict';

var VERIFIER_SERVICE = 'https://verifier.accounts.firefox.com/v2';

var fs = require('fs');
var http = require('http');
var bodyParser = require('body-parser');
var multer = require('multer');

var HttpRequest = require('./http_rest');

// Our modules
var Storage = require('./storage');
var Utils = require('./utils');
var Datastore = require('./datastore');

var loggerStream = fs.createWriteStream('./log.txt', {
  flags: 'a',
  encoding: 'utf-8',
  mode: '0666'
});

var express = require('express');
var app = express();

app.configure(function() {
  app.use(express.logger({format: 'dev', stream: loggerStream}));
  // for parsing application/x-www-form-urlencoded
  app.use(bodyParser.urlencoded({ extended: true }));
  app.use(bodyParser.json());
  app.use(multer());
});

var httpServer = http.createServer(app);
httpServer.listen(80);

console.log('CloudDatastore server up and running');

// Registers a client with the server
app.post('/ds/register', function(req, resp) {
  console.log('Register invoked!!');
  var data = Utils.getObjectFromRequest(req);

  var assertion = data.assertion;
  var audience = data.audience;

  console.log('Audience: ', audience);

  if (!assertion || !audience) {
    resp.send(404);
    return;
  }

  console.log('Assertion to be verified2: ', assertion);
  var verificationData = {
    audience: audience,
    assertion: assertion
  };

  HttpRequest.post(VERIFIER_SERVICE, function(err, verifResponse) {
    if (err) {
      resp.send(500);
      return;
    }

    var verifObj = JSON.parse(verifResponse);
    var msisdn = verifObj.idpClaims.verifiedMSISDN;

    Utils.generateToken(assertion, msisdn, function(err, token) {
      if (err) {
        resp.send(500);
        return;
      }

      resp.type('json');
      resp.set('Expires', 'Thu, 15 Apr 2010 20:00:00 GMT');
      resp.send({
        token: token,
        msisdn: msisdn
      });
    });
  }, verificationData);

});

// Get an object from the datastore by id
app.get('/dsapi/:dsname/:id', function(req, resp) {
  var params = Utils.getParams(req);
  if (!params) {
    resp.send(404);
    return;
  }

  Datastore.getFromDatastore(params, function(error, result) {
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

// Add data to the datastore (create)
app.put('/dsapi/:dsname/:id', function(req, resp) {
  console.log('invoked...', req.body);
  var params = Utils.getParams(req);
  var obj = Utils.getObjectFromRequest(req);

  if (!params || !obj) {
    resp.send(404);
    return;
  }

  Datastore.addToDatastore(params, obj, null, function(error, result) {
    if (error) {
      resp.send(500);
      return;
    }

    resp.send('ok');
  });
});


// Put data on the datastore (update)
app.post('/dsapi/:dsname/:id', function(req, resp) {
  var params = Utils.getParams(req);
  var obj = Utils.getObjectFromRequest(req);

  if (!params || !obj) {
    resp.send(404);
    return;
  }

  Datastore.putToDatastore(params, obj, null, function(error, result) {
    if (error) {
      resp.send(500);
      return;
    }

    resp.send('ok');
  });
});

// Delete from datastore
app.delete('/dsapi/:dsname/:id', function(req, resp) {
  console.log('Delete!!!!');

  var params = Utils.getParams(req);
  if (!params) {
    resp.send(404);
    return;
  }

  if (params.id === '__all__') {
    console.log('Clear datastore');
    Datastore.clearDatastore(params, function(err, result) {
      if (err) {
        resp.send(500);
        return;
      }
      if (result == 1) {
        resp.send('ok');
      }
      else {
        resp.send(404);
      }
    });

    return;
  }

  Datastore.deleteFromDatastore(params, null, function(err, result) {
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



app.get('/dsapi/:dsname/blob/:id', function(req, resp) {
  var url = URL.parse(req.originalUrl);
  var params = QueryString.parse(url.query);

  var token = params.token;

  var dsName = req.params.dsname;
  var blobId = req.params.id;

  if (!token || !dsName || !blobId) {
    resp.send(404);
    return;
  }

  Storage.getMedia(token, dsName, blobId, function() {}).pipe(resp);
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
app.get('/dsapi/sync', function(req, resp) {
  console.log('hi');
});

// These are debug operations

app.get('/dsdebug/:dsname/list_media', function(req, resp) {
  console.log('List media');
  var params = Utils.getParams(req);

  var token = params.token;
  var dsName = params.datastoreName;

  if (!token || !dsName) {
    resp.send(404);
    return;
  }

  Utils.token2Msisdn(token, function(err, msisdn) {
    if (err) {
      console.error(err);
      resp.send(500);
      return;
    }

    Storage.listMedia(msisdn, dsName, function(err, result) {
      if (err) {
        console.error(err);
        resp.send(err);
        return;
      }
      resp.type('json');
      resp.set('Expires', 'Thu, 15 Apr 2010 20:00:00 GMT');
      resp.send(new Buffer(result));
    });

  });
});

app.get('/dsdebug/list_buckets', function(req, resp) {
  Storage.listBuckets(function(err, result) {
    if (err) {
      console.error(err);
      return;
    }
    resp.type('json');
    resp.set('Expires', 'Thu, 15 Apr 2010 20:00:00 GMT');
    resp.send(new Buffer(result));
  });
});

app.get('/dsdebug/:dsname/delete_store_bucket', function(req, resp) {
  var params = Utils.getParams(req);

  var token = params.token;
  var dsName = params.datastoreName;

  if (!token || !dsName) {
    resp.send(404);
    return;
  }

  Utils.token2Msisdn(token, function(err, msisdn) {
    if (err) {
      console.log(err);
      return;
    }

    Storage.deleteBucket(msisdn, dsName, function(err, result) {
      if (err) {
        console.error(err);
        return;
      }

      resp.send('ok');
    });
  });
});


// Gets all the data the datastore has (typically used to bootstrap)
app.get('/dsapi/:dsname/getAll', function(req, resp) {
  var params = Utils.getParams(req);
  Utils.getHashName(params, function(err, hashName) {
    if (err) {
      resp.send(500);
      return;
    }
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
