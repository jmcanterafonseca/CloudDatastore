'use strict';

var URL = require('url');
var QueryString = require('querystring');

var redis = require('redis'),
    client = redis.createClient();

var TOKENS_HASH = 'tokensHash';

// Stores those media which have been already stored
var MEDIA_HASH = 'mediaHash';

var TOKEN_LENGTH = 10;

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
      cb(err || 'not found', null);
      return;
    }
    cb(null, msisdn + '_' + params.datastoreName, msisdn);
  });
}

var REVISIONID_KEY = 'revisionId';
function getRevisionHashName(params) {
  return getHashName(params) + '_' + 'revisions';
}

function getRevisionIdKey(token, dsName) {
  return REVISIONID_KEY + '_' + token + '_' + dsName;
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
