'use strict';

var URL = require('url');
var QueryString = require('querystring');

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
    id: params.id,
    req: req
  }
}

function getObjectFromRequest(req) {
  return req.body;
}

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

function getBlobId(url) {
  // Ensure it starts with a letter
  var val = 'd' + '_' + url.substring(url.indexOf(':') + 1);
  return val.replace(/-/g, '_');
}


exports.getParams = getParams;
exports.getObjectFromRequest = getObjectFromRequest;
exports.getHashName = getHashName;

