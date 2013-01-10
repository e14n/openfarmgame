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
    Plot = require("../models/plot"),
    Crop = require("../models/crop"),
    CropType = require("../models/croptype"),
    Host = require("../models/host"),
    RequestToken = require("../models/requesttoken"),
    OpenFarmGame = require("../models/openfarmgame");

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

exports.index = function(req, res, next) {
    var plots;

    if (req.user) {
        async.waterfall([
            function(callback) {
                Plot.readArray(req.user.plots, callback);
            },
            function(results, callback) {
                var cropIDs;
                plots = results;
                cropIDs = _.compact(_.pluck(plots, "crop"));
                if (cropIDs.length > 0) {
                    Crop.readAll(cropIDs, callback);
                } else {
                    callback(null, []);
                }
            }
        ], function(err, crops) {
            if (err) {
                next(err);
            } else {
                res.render("farmer", {title: "Open Farm Game", farmer: req.user, plots: plots, crops: crops});
            }
        });
    } else {
        res.render('index', { title: "Open Farm Game" });
    }
};

exports.about = function(req, res) {
    res.render('about', { title: 'About Open Farm Game' });
};

exports.login = function(req, res) {
    res.render('login', { title: 'Login' });
};

exports.handleLogin = function(req, res, next) {

    var id = req.body.webfinger,
        hostname = Farmer.getHostname(id),
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
                    async.parallel([
                        function(callback) {
                            farmer.joinActivity(callback);
                        },
                        function(callback) {
                            req.app.notify(farmer,
                                           "Welcome to " + OpenFarmGame.name,
                                           "welcome",
                                           {farmer: farmer},
                                           callback);
                        }
                    ], function(err, results) {
                        if (err) {
                            req.app.log(err);
                        }
                    });
                });
            }
        }
    });
};

exports.handleLogout = function(req, res) {

    delete req.session.farmerID;
    delete req.user;

    res.redirect("/", 303);
};

exports.farmer = function(req, res, next) {

    var id = req.params.webfinger,
        farmer,
        plots;

    async.waterfall([
        function(callback) {
            Farmer.get(id, callback);
        },
        function(results, callback) {
            farmer = results;
            Plot.readArray(farmer.plots, callback);
        },
        function(results, callback) {
            var cropIDs;
            plots = results;
            cropIDs = _.compact(_.pluck(plots, "crop"));
            if (cropIDs.length > 0) {
                Crop.readAll(cropIDs, callback);
            } else {
                callback(null, []);
            }
        }
    ], function(err, crops) {
        if (err) {
            next(err);
        } else {
            res.render("farmer", {title: "Farmer " + farmer.name, farmer: farmer, plots: plots, crops: crops});
        }
    });
};

exports.tearUp = function(req, res, next) {

    var plot = req.plot;

    res.render('tearup', { title: 'Tear up a crop', farmer: req.user, plot: plot });
};

exports.handleTearUp = function(req, res, next) {

    var plot = req.plot,
        crop = req.user.plots[plot].crop;
    
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

    var plot = req.plot;

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

    var plot = req.plot;

    CropType.getAll(function(err, types) {
        res.render('plant', { title: 'Plant a new crop', farmer: req.user, plot: plot, types: types });
    });
};

exports.handlePlant = function(req, res, next) {

    var plot = req.plot,
        slug = req.body.type,
        crop,
        now = Date.now();

    async.waterfall([
        function(callback) {
            CropType.get(slug, callback);
        },
        function(type, callback) {
            if (type.cost > req.user.coins) {
                callback(new Error("Not enough coins"), null);
                return;
            }

            req.user.coins -= type.cost;

            Crop.create({type: type.slug,
                         name: type.name,
                         status: "New",
                         state: 0,
                         planted: now},
                        callback);
        },
        function(results, callback) {
            crop = results;
            plot.crop = crop.uuid;
            plot.save(callback);
        }
    ], function(err) {
        if (err) {
            next(err);
        } else {
            res.redirect("/");
            req.user.plantActivity(crop, function(err) {});
        }
    });
};

exports.buyPlot = function(req, res, next) {

    res.render('buy-plot', { title: 'Buy a plot', farmer: req.user });
};

exports.handleBuyPlot = function(req, res, next) {

    var plot;

    if (req.user.coins < 50) {
        next(new Error("Not enough coins to buy a plot."));
        return;
    }

    req.user.coins = req.user.coins - 50;

    req.user.plots.push({id: "urn:uuid:"+uuid.v4()});

    plot = req.user.plots.length - 1;

    req.user.save(function(err) {
        if (err) {
            next(err);
        } else {
            res.redirect("/");
            req.user.buyActivity(plot, function(err) {});
        }
    });
};

