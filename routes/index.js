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
    uuid = require("node-uuid"),
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
    if (req.user) {
        res.render('farmer', { title: 'Open Farm Game', farmer: req.user });
    } else {
        res.render('index', { title: 'Open Farm Game' });
    }
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
            if (err instanceof Error) {
                next(err);
            } else if (err.data) {
                next(new Error(err.data));
            }
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
        object,
        newFarmer = false;

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
                    newFarmer = true;
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
            res.redirect("/");
            if (newFarmer) {
                process.nextTick(function() {
                    farmer.joinActivity(function(err) {});
                });
            }
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

exports.tearUp = function(req, res, next) {

    var plot = req.plot,
        crops = testCrops();

    res.render('tearup', { title: 'Tear up a crop', farmer: req.user, plot: plot });
};

exports.handleTearUp = function(req, res, next) {

    var plot = req.plot,
        crop = req.user.plots[plot].crop;

    req.user.plots[plot] = {};
    
    req.user.save(function(err) {
        if (err) {
            next(err);
        } else {
            res.redirect("/");
            req.user.tearUpActivity(crop, function(err) {});
        }
    });
};

exports.water = function(req, res, next) {

    var plot = req.plot,
        crops = testCrops();

    res.render('water', { title: 'Water a crop', farmer: req.user, plot: plot });
};

exports.handleWater = function(req, res, next) {

    var plot = req.plot;

    if (req.user.coins < 1) {
        next(new Error("Not enough coins to water something."));
    }

    req.user.coins = req.user.coins - 1;

    req.user.plots[plot].crop.watered = Date.now();
    req.user.plots[plot].crop.needsWater = false;

    if (req.user.plots[plot].crop.status == "New") {
        req.user.plots[plot].crop.status = "Growing";
    } else if (req.user.plots[plot].crop.status == "Growing") {
        req.user.plots[plot].crop.status = "Almost ready";
    }
    
    req.user.save(function(err) {
        if (err) {
            next(err);
        } else {
            res.redirect("/");
            req.user.waterActivity(plot, function(err) {});
        }
    });
};

exports.plant = function(req, res, next) {
    var plot = req.plot,
        crops = testCrops();

    res.render('plant', { title: 'Plant a new crop', farmer: req.user, plot: plot, crops: crops });
};

exports.handlePlant = function(req, res, next) {

    var plot = req.plot,
        cropIndex = parseInt(req.body.cropIndex, 10),
        crops = testCrops(),
        crop,
        now = Date.now();

    if (cropIndex < 0 || cropIndex >= crops.length) {
        next(new Error("Invalid crop"));
        return;
    }

    crop = crops[cropIndex];

    if (crop.cost > req.user.coins) {
        next(new Error("Not enough coins."));
        return;
    }

    req.user.coins -= crop.cost;

    req.user.plots[plot] = {
        crop: {
            name: crop.name,
            id: "urn:uuid:"+uuid.v4(),
            status: "New",
            needsWater: true,
            ready: false,
            planted: now,
            watered: 0
        }
    };

    req.user.save(function(err) {
        if (err) {
            next(err);
        } else {
            res.redirect("/");
            req.user.plantActivity(plot, function(err) {});
        }
    });
};

var testCrops = function() {
    return [
        {
            name: "Corn",
            cost: 5,
            price: 17
        },
        {
            name: "Tomatoes",
            cost: 3,
            price: 10
        }
    ];
};
