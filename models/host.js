// host.js
//
// data object representing a remote host
//
// Copyright 2013, StatusNet Inc.
//
// Licensed under the Apache License, Version 2.0 (the "License");
// you may not use this file except in compliance with the License.
// You may obtain a copy of the License at
//
//     http://www.apache.org/licenses/LICENSE-2.0
//
// Unless required by applicable law or agreed to in writing, software
// distributed under the License is distributed on an "AS IS" BASIS,
// WITHOUT WARRANTIES OR CONDITIONS OF ANY KIND, either express or implied.
// See the License for the specific language governing permissions and
// limitations under the License.

var _ = require("underscore"),
    wf = require("webfinger"),
    async = require("async"),
    qs = require("querystring"),
    OAuth = require("oauth").OAuth,
    DatabankObject = require("databank").DatabankObject,
    OpenFarmGame = require("./openfarmgame"),
    RequestToken = require("./requesttoken");

var Host = DatabankObject.subClass("host");

var OAUTH_RT = "http://apinamespace.org/oauth/request_token",
    OAUTH_AT = "http://apinamespace.org/oauth/access_token",
    OAUTH_AUTHZ = "http://apinamespace.org/oauth/authorize",
    WHOAMI = "http://apinamespace.org/activitypub/whoami",
    OAUTH_CRED = "registration_endpoint";

Host.schema = {
    pkey: "hostname",
    fields: ["client_id",
             "client_secret",
             "registration_endpoint",
             "request_token_endpoint",
             "access_token_endpoint",
             "authorization_endpoint",
             "whoami_endpoint",
             "created",
             "updated"]
};

Host.ensureHost = function(hostname, callback) {
    Host.get(hostname, function(err, host) {
        if (err && err.name == "NoSuchThingError") {
            Host.discover(hostname, callback);
        } else if (err) {
            callback(err, null);
        } else {
            // XXX: update endpoints?
            callback(null, host);
        }
    });
};

Host.discover = function(hostname, callback) {

    var props = {
        hostname: hostname
    };

    async.waterfall([
        function(callback) {
            wf.hostmeta(hostname, callback);
        },
        function(jrd, callback) {
            var rels = {
                registration_endpoint: OAUTH_CRED,
                request_token_endpoint: OAUTH_RT,
                access_token_endpoint: OAUTH_AT,
                authorization_endpoint: OAUTH_AUTHZ,
                whoami_endpoint: WHOAMI
            },
                prop,
                rel;

            for (prop in rels) {
                rel = rels[prop];
                var links = _.where(jrd.links, {rel: rel});
                if (links.length === 0) {
                    callback(new Error(hostname + " does not implement " + rel), null);
                    return;
                } else {
                    props[prop] = links[0].href;
                }
            }

            Host.getCredentials(props.registration_endpoint, callback);
        },
        function(cred, callback) {
            props.client_id = cred.client_id;
            props.client_secret = cred.client_secret;
            Host.create(props, callback);
        }
    ], callback);
};

Host.getCredentials = function(endpoint, callback) {
    async.waterfall([
        function(callback) {
            var body = qs.stringify({type: "client_associate",
                                     application_type: "web",
                                     application_name: "Open Farm Game",
                                     redirect_uris: OpenFarmGame.url("/authorized")});

            Host.dialbackClient.post(endpoint,
                                     OpenFarmGame.hostname,
                                     body,
                                     "application/x-www-form-urlencoded",
                                     callback);
        }
    ], function(err, response, doc) {
        var client;
        if (err) {
            callback(err, null);
        } else if (response.statusCode >= 400 && response.statusCode < 600) {
            callback(new Error("HTTP Error " + response.statusCode + ": " + doc), null);
        } else if (!response.headers["content-type"]) {
            callback(new Error("No content type"), null);
        } else if (response.headers["content-type"].substr(0, "application/json".length) != "application/json") {
            callback(new Error("Bad content type: " + response.headers["content-type"]), null);
        } else {
            try {
                client = JSON.parse(doc);
                callback(null, client);
            } catch (e) {
                callback(e, null);
            }
        }
    });
};

Host.prototype.getRequestToken = function(callback) {
    var host = this,
        oa = host.getOAuth();

    async.waterfall([
        function(callback) {
            oa.getOAuthRequestToken(callback);
        },
        function(token, secret, other, callback) {
            RequestToken.create({token: token,
                                 secret: secret,
                                 hostname: host.hostname},
                                callback);
        }
    ], callback);
};

Host.prototype.authorizeURL = function(rt, callback) {
    var host = this,
        separator;

    if (_.contains(host.authorization_endpoint, "?")) {
        separator = "&";
    } else {
        separator = "?";
    }
    
    return host.authorization_endpoint + separator + "oauth_token=" + rt.token;
};

Host.prototype.getAccessToken = function(rt, verifier, callback) {
    var host = this,
        oa = host.getOAuth();

    oa.getOAuthAccessToken(rt.token, rt.secret, verifier, callback);
};

Host.prototype.whoami = function(token, secret, callback) {
    var host = this,
        oa = host.getOAuth();

    // XXX: ssl

    async.waterfall([
        function(callback) {
            oa.get(host.whoami_endpoint, token, secret, callback);
        }
    ], function(err, doc, response) {
        var obj;
        if (err) {
            callback(err, null);
        } else {
            try {
                obj = JSON.parse(doc);
                callback(null, obj);
            } catch(e) {
                callback(e, null);
            }
        }
    });
};

Host.prototype.getOAuth = function() {

    var host = this;

    return new OAuth(host.request_token_endpoint,
                     host.access_token_endpoint,
                     host.client_id,
                     host.client_secret,
                     "1.0",
                     OpenFarmGame.url("/authorized/"+host.hostname),
                     "HMAC-SHA1",
                     null, // nonce size; use default
                     {"User-Agent": "openfarmgame.com/0.1.0"});
};

module.exports = Host;
