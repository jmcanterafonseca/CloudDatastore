'use strict';

var https = require('https');
var URL = require('url');

function get(uri, cb, options) {
  var parsedUri = URL.parse(uri);

  var optionsServer = {
    method: 'GET',
    hostname: parsedUri.host,
    port: parsedUri.port,
    path: parsedUri.path
  };

  console.log(JSON.stringify(optionsServer));

  var req = https.request(optionsServer, function(res) {
    console.log('Status: ', res.statusCode);
    res.setEncoding('utf-8');
    var responseStr = '';
    res.on('data', function(chunk) {
      responseStr += chunk;
    });
    res.on('end',function(chunk) {
      if(chunk) {
        responseStr += chunk;
      }
      if(res.statusCode === 200) {
        cb(null, responseStr);
      }
      else {
        cb('Error: ' + res.statusCode, null);
      }
    });
  });

  req.on('error', function(err) {
    console.error('Error!!!: ', resource, method);
    cb(err, null);
  });

  req.end();
}

function post(uri, cb, data, options) {
  var parsedUri = URL.parse(uri);

  var dataString = JSON.stringify(data);

  var headers = {
  'Content-Type': 'application/json',
  'Content-Length': dataString.length
};

  var optionsServer = {
    method: 'POST',
    hostname: parsedUri.host,
    port: parsedUri.port,
    path: parsedUri.path,
    headers: headers
  };

  var req = https.request(optionsServer, function(res) {
    console.log('Status: ', res.statusCode);
    res.setEncoding('utf-8');
    var responseStr = '';
    res.on('data', function(chunk) {
      responseStr += chunk;
    });
    res.on('end',function(chunk) {
      if(chunk) {
        responseStr += chunk;
      }
      if(res.statusCode === 200) {
        cb(null, responseStr);
      }
      else {
        cb('Error: ' + res.statusCode, null);
      }
    });
  });

  req.on('error', function(err) {
    console.error('Error!!!: ', resource, method);
    cb(err, null);
  });

  req.write(dataString);

  req.end();
}


exports.get = get;
exports.post = post;
