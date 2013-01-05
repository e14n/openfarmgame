// index.js
//
// Most of the routes in the application
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

var wf = require("webfinger"),
    async = require("async"),
    _ = require("underscore"),
    Farmer = require("../models/farmer"),
    Host = require("../models/host"),
    RequestToken = require("../models/requesttoken");

exports.hostmeta = function(req, res) {
    res.json({
        links: [
            {
                rel: "dialback",
                href: "http://" + req.app.config.hostname + "/dialback"
            }
        ]
    });
};

exports.index = function(req, res) {
    res.render('index', { title: 'Open Farm Game' });
};

exports.login = function(req, res) {
    res.render('login', { title: 'Login' });
};

exports.about = function(req, res) {
    res.render('about', { title: 'About Open Farm Game' });
};

exports.handleLogin = function(req, res, next) {

    var id = req.body.webfinger,
        parts = id.split("@"),
        hostname = parts[1],
        host;
    
    async.waterfall([
        function(callback) {
            Host.ensureHost(hostname, callback);
        },
        function(results, callback) {
            host = results;
            host.getRequestToken(callback);
        }
    ], function(err, rt) {
        if (err) {
            next(new Error(err.data));
        } else {
            res.redirect(host.authorizeURL(rt));
        }
    });
};

exports.authorized = function(req, res, next) {

    var hostname = req.params.hostname,
        token = req.query.oauth_token,
        verifier = req.query.oauth_verifier,
        rt,
        host,
        access_token,
        token_secret,
        id,
        object;

    async.waterfall([
        function(callback) {
            async.parallel([
                function(callback) {
                    RequestToken.get(RequestToken.key(hostname, token), callback);
                },
                function(callback) {
                    Host.get(hostname, callback);
                }
            ], callback);
        },
        function(results, callback) {
            rt = results[0];
            host = results[1];
            host.getAccessToken(rt, verifier, callback);
        },
        function(token, secret, extra, callback) {
            access_token = token;
            token_secret = secret;
            async.parallel([
                function(callback) {
                    rt.del(callback);
                },
                function(callback) {
                    host.whoami(access_token, token_secret, callback);
                }
            ], callback);
        },
        function(results, callback) {
            object = results[1];
            id = object.id;
            if (id.substr(0, 5) == "acct:") {
                id = id.substr(5);
            }
            Farmer.get(id, function(err, farmer) {
                if (err && err.name === "NoSuchThingError") {
                    Farmer.fromPerson(object, access_token, token_secret, callback);
                } else if (err) {
                    callback(err, null);
                } else {
                    callback(null, farmer);
                }
            });
        }
    ], function(err, farmer) {
        if (err) {
            next(err);
        } else {
            req.session.farmerID = farmer.id;
            res.redirect("/farmer/"+farmer.id, 303);
        }
    });
};

exports.farmer = function(req, res, next) {

    var id = req.params.webfinger;

    async.waterfall([
        function(callback) {
            Farmer.get(id, callback);
        }
    ], function(err, farmer) {
        if (err) {
            next(err);
        } else {
            res.render('farmer', { title: 'Farmer ' + farmer.name, farmer: farmer });
        }
    });
};

exports.plant = function(req, res, next) {
    var id = req.params.webfinger,
        plot = req.params.plot,
        crops = testCrops();

    async.waterfall([
        function(callback) {
            Farmer.get(id, callback);
        }
    ], function(err, farmer) {
        if (err) {
            next(err);
        } else {
            res.render('plant', { title: 'Plant a new crop', farmer: farmer, plot: plot, crops: crops });
        }
    });
};

exports.handlePlant = function(req, res, next) {
    var id = req.body.webfinger,
        plot = req.body.plot,
        crops = testCrops();

    res.redirect("/farmer/"+id, 303);
};

var testCrops = function() {
    return [
        {
            name: "Corn",
            cost: 5,
            price: 18
        },
        {
            name: "Tomatoes",
            cost: 3,
            price: 10
        }
    ];
};
