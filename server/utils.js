'use strict';

var URL = require('url');
var QueryString = require('querystring');
var Request = require('request');

var redis = require('redis'),
    client = redis.createClient();

var TOKENS_HASH = 'tokensHash';

// Stores those media which have been already stored
var MEDIA_HASH = 'mediaHash';

var PUSH_HASH = 'pushHash';

var TOKEN_LENGTH = 10;

function removeToken(token, cb) {
  client.hdel(TOKENS_HASH, token, cb);
}

function addMediaStored(mediaId, cb) {
  client.hset(MEDIA_HASH, mediaId, '1', cb);
}

function deleteMediaStored(mediaId, cb) {
  client.hdel(MEDIA_HASH, mediaId, cb);
}

function isMediaStored(mediaId, cb) {
  client.hget(MEDIA_HASH, mediaId, function(err, res) {
    if (err) {
      cb(err);
      return;
    }
    if (res === '1') {
      cb(null, true);
    }
    else {
      cb(null, false);
    }
  });
}

function randomInt (low, high) {
  return Math.floor(Math.random() * (high - low) + low);
}

function getParams(req) {
  var params = req.params;
  var url = URL.parse(req.originalUrl);
  var queryParams = QueryString.parse(url.query);

  return {
    token: queryParams.token,
    datastoreName: params.dsname,
    id: params.id,
    revisionId: queryParams.revisionId,
    req: req
  }
}

function generateToken(assertion, msisdn, cb) {
  var start = randomInt(0, assertion.length - TOKEN_LENGTH);

  var token = assertion.substr(start, TOKEN_LENGTH);

  client.hset(TOKENS_HASH, token, msisdn, function(error, result) {
    if (error) {
      cb(error);
      return;
    }
    cb(null, token);
  });
}

function getObjectFromRequest(req) {
  var out;

  if (req.is('json')) {
    out = req.body;
  }
  else {
    out = JSON.parse(req.body.object);
  }

  console.log('Object from Request: ', out);
  return out;
}

function addPushEndPoint(msisdn, token, endPoint, cb) {
  if (!endPoint) {
    cb(null, 'done');
    return;
  }
  client.hget(PUSH_HASH, msisdn, function(err, result) {
    if (err) {
      cb(err);
      return;
    }

    var list;

    if (!result) {
      list = [];
    }
    else {
      list = JSON.parse(result);
    }

    list.push({
      token: token,
      endPoint: endPoint
    });

    client.hset(PUSH_HASH, msisdn, JSON.stringify(list), cb);
  });
}

function removePushEndPoint(msisdn, token, cb) {
  client.hget(PUSH_HASH, msisdn, function(err, result) {
    if (err) {
      cb(err);
      return;
    }

    var list;

    if (!result) {
      list = [];
    }
    else {
      list = JSON.parse(result);
    }

    var newList = list.filter(function(aObj) {
      return aObj.token !== token;
    });

    client.hset(PUSH_HASH, msisdn, JSON.stringify(newList), cb);
  });
}

function getPushEndPoints(msisdn, token, cb) {
  client.hget(PUSH_HASH, msisdn, function(err, result) {
    if (err) {
      cb(err);
      return;
    }

    var list;

    if (!result) {
      list = [];
    }
    else {
      list = JSON.parse(result);
    }

    var endPointList = list.filter(function(obj) {
      return obj.token !== token;
    }).map(function(filteredObj) {
        return filteredObj.endPoint;
    });

    cb(null, endPointList);
  });
}

function notifyChanges(clientId, token, newVersion, cb) {
  getPushEndPoints(clientId, token, function(err, endPointList) {
    if (err) {
      cb(err);
      return;
    }
    endPointList.forEach(function(aEndPoint) {
      if (!aEndPoint) {
        return;
      }

      console.log('End point to notify changes: ', aEndPoint);
      Request.put({
        url: aEndPoint,
        body: 'version=' + newVersion,
        strictSSL: false
      }, function(err, response, body) {
        if (err) {
          cb(err);
          return;
        }
        console.log('Body response: ', body);
        var res = JSON.parse(body);
        if (!res.reason) {
          console.log('Push notification sent correctly');
          cb(null, 'ok');
        }
        else {
          console.error('Error while push notification: ', res);
          cb(err);
        }
      });
    });
  });
}

function token2Msisdn(token, cb) {
  client.hget(TOKENS_HASH, token, function(error, msisdn) {
    if (error) {
      cb(error);
      return;
    }
    cb(null, msisdn);
  });
}

function getHashName(params, cb) {
  token2Msisdn(params.token, function(err, msisdn) {
    if (err || !msisdn) {
      cb(err || 'not found');
      return;
    }
    cb(null, msisdn + '_' + params.datastoreName, msisdn);
  });
}

// The hash that stores the changes made for each revision
function getRevisionsHashName(clientId, dsName) {
  return clientId + '_' + dsName + '_' + 'revisions';
}

function getRevisionIdKey(clientId, dsName) {
  return clientId + '_' + dsName;
}

function getBlobId(url) {
  // Ensure it starts with a letter
  var val = 'd' + '_' + url.substring(url.lastIndexOf('/') + 1);
  return val.replace(/-/g, '_');
}

exports.getParams = getParams;
exports.getObjectFromRequest = getObjectFromRequest;
exports.getHashName = getHashName;
exports.generateToken = generateToken;
exports.getBlobId = getBlobId;
exports.token2Msisdn = token2Msisdn;
exports.addMediaStored = addMediaStored;
exports.isMediaStored = isMediaStored;
exports.deleteMediaStored = deleteMediaStored;
exports.getRevisionsHashName = getRevisionsHashName;
exports.getRevisionIdKey = getRevisionIdKey;
exports.addPushEndPoint = addPushEndPoint;
exports.getPushEndPoints = getPushEndPoints;
exports.notifyChanges = notifyChanges;
exports.removeToken = removeToken;
exports.removePushEndPoint = removePushEndPoint;
