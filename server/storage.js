'use strict';

var Storage = require('request');
var fs = require('fs');

// Configuration
var subdomain = 'cantera';
var user      = 'cantera';
var pwd       = '';
var endpoint  = 'nos-eu-mad-1.instantservers.telefonica.com';
var baseUrl   = 'https://' + subdomain + '.' + endpoint;

function bucketName(token, dsName) {
  return encodeURIComponent('bucket' + '_' + token + '_' + dsName);
}

function storageCb(cb, error, response, body) {
  if (error) {
    cb(error, null);
    return;
  }
  if (response.statusCode === 201 || response.statusCode === 200) {
    cb(null, body);
  }
  else {
    cb(response.statusCode, null);
  }
}

// Creates a bucket for a Facebook uid
function createBucketForDatastore(token, dsName, cb) {
  Storage.post({
    url: baseUrl + '/' + bucketName(token, dsName),
    headers: {
      'Content-Type': 'application/castorcontext'
    },
  }, storageCb.bind(null, cb)).auth(user, pwd, true);
}

// Uploads media to the bucket corresponding to the uid
// Content is an stream ready to be piped to instant storage
function uploadMedia(token, dsName, req, metadata, cb) {
  console.log(JSON.stringify(req.files));
  var bodyStream = fs.createReadStream(req.files[metadata.fileName].path);
  bodyStream.pipe(Storage.post(baseUrl + '/' + bucketName(token, dsName) + '/' +
      metadata.fileName, storageCb.bind(null, cb)).auth(user, pwd, true));
}

// Lists all the stored media corresponding to the uid
function listMedia(token, dsName, cb) {
  Storage(baseUrl + '/' + bucketName(token, dsName) + '?format=json',
          storageCb.bind(null, cb)).auth(user, pwd, true);
}

function listBuckets(cb) {
  Storage(baseUrl + '?format=json', storageCb.bind(null, cb)).
            auth(user, pwd, true);
}

function getMedia(token, dsName, mediaId, cb) {
  return Storage(baseUrl + '/' + bucketName(token, dsName) +
                  '/' + encodeURIComponent(mediaId),
                  storageCb.bind(null, cb)).auth(user, pwd, true);
}

function getThumbnail4Media(uid, mediaId, cb) {
  return getMedia(uid, mediaId + '_thumb', cb);
}

function deleteBucket(token, dsName, cb) {
  Storage.del(baseUrl + '/' + bucketName(token, dsName) + '?recursive=yes',
    storageCb.bind(null, function(err, result) {
      if (err) {
        cb(err);
        return;
      }
      // Once all media has been deleted the bucket is re-created
      createBucketForDatastore(token, dsName, cb);
      })
    ).auth(user, pwd, true);
}

function deleteMedia(uid, dsName, mediaId, cb) {
  Storage.del(baseUrl + '/' + bucketName(uid, dsName) +'/' + mediaId,
    storageCb.bind(null, cb)
  ).auth(user, pwd, true);
}

exports.createBucketForDatastore = createBucketForDatastore;
exports.uploadMedia = uploadMedia;
exports.listBuckets = listBuckets;
exports.listMedia   = listMedia;
exports.getMedia    = getMedia;
exports.getThumbnail4Media = getThumbnail4Media;
exports.deleteBucket = deleteBucket;
exports.deleteMedia = deleteMedia;
