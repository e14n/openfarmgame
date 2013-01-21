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
                href: OpenFarmGame.url("/dialback")
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
                res.render("farmer", {title: "Open Farm Game", user: req.user, farmer: req.user, plots: plots, crops: crops});
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
            res.render("farmer", {title: "Farmer " + farmer.name, 
                                  user: req.user, 
                                  farmer: farmer, 
                                  plots: plots, 
                                  crops: crops});
        }
    });
};

exports.tearUp = function(req, res, next) {

    var plot = req.plot;

    Crop.get(plot.crop, function(err, crop) {
        if (err) {
            next(err);
        } else {
            res.render('tearup', { title: 'Tear up a crop',
                                   farmer: req.user,
                                   plot: plot,
                                   crop: crop });
        }
    });
};

exports.handleTearUp = function(req, res, next) {

    var plot = req.plot,
        crop;

    async.waterfall([
        function(callback) {
            Crop.get(plot.crop, callback);
        },
        function(results, callback) {
            crop = results;
            plot.crop = null;
            plot.emptyNotified = null;
            plot.save(callback);
        },
        function(saved, callback) {
            crop.del(callback);
        }
    ], function(err) {
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

    Crop.get(plot.crop, function(err, crop) {
        if (err) {
            next(err);
        } else {
            res.render('water', {title: 'Water a crop', farmer: req.user, plot: plot, crop: crop});
        }
    });
};

exports.handleWater = function(req, res, next) {

    var plot = req.plot;

    if (req.user.coins < 1) {
        next(new Error("Not enough coins to water something."));
        return;
    }

    async.waterfall([
        function(callback) {
            req.user.coins -= 1;
            req.user.save(callback);
        },
        function(saved, callback) {
            Crop.get(plot.crop, callback);
        },
        function(crop, callback) {

            crop.watered++;
            crop.state = Crop.GROWING;

            crop.save(callback);
        }
    ], function(err, crop) {
        if (err) {
            next(err);
        } else {
            res.redirect("/");
            req.user.waterActivity(crop, function(err) {});
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
        type,
        crop,
        now = Date.now();

    async.waterfall([
        function(callback) {
            CropType.get(slug, callback);
        },
        function(results, callback) {

            type = results;

            if (type.cost > req.user.coins) {
                callback(new Error("Not enough coins"), null);
                return;
            }

            req.user.coins -= type.cost;

            req.user.save(callback);
        },
        function(saved, callback) {
            Crop.create({type: type.slug,
                         plot: plot.uuid,
                         owner: req.user.id,
                         name: type.name,
                         state: Crop.NEW},
                        callback);
        },
        function(results, callback) {
            crop = results;
            plot.crop = crop.uuid;
            plot.emptyNotified = null;
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

    async.waterfall([
        function(callback) {
            Plot.create({owner: req.user.id}, callback);
        },
        function(results, callback) {
            plot = results;
            req.user.coins -= 50;
            req.user.plots.push(plot.uuid);
            req.user.save(callback);
        }
    ], function(err, saved) {
        if (err) {
            next(err);
        } else {
            res.redirect("/");
            req.user.buyActivity(plot, function(err) {});
        }
    });
};

exports.harvest = function(req, res, next) {

    var plot = req.plot,
        crop;

    async.waterfall([
        function(callback) {
            Crop.get(plot.crop, callback);
        },
        function(results, callback) {
            crop = results;
            CropType.get(crop.type, callback);
        }
    ], function(err, type) {
        if (err) {
            next(err);
        } else {
            res.render('harvest', { title: 'Harvest a crop', farmer: req.user, plot: plot, crop: crop, type: type });
        }
    });
};

exports.handleHarvest = function(req, res, next) {

    var plot = req.plot,
        crop,
        type;

    async.waterfall([
        function(callback) {
            Crop.get(plot.crop, callback);
        },
        function(results, callback) {
            crop = results;
            CropType.get(crop.type, callback);
        },
        function(results, callback) {
            type = results;
            async.parallel([
                function(callback) {
                    crop.state = Crop.HARVESTED;
                    crop.save(callback);
                },
                function(callback) {
                    plot.crop = null;
                    plot.emptyNotified = null;
                    plot.save(callback);
                },
                function(callback) {
                    // Dogfood or something
                    if (crop.damaged) {
                        req.user.coins += Math.ceil(type.price/2.0);
                    } else {
                        req.user.coins += type.price;
                    }
                    req.user.save(callback);
                }
            ], callback);
        }
    ], function(err, results) {
        if (err) {
            next(err);
        } else {
            res.redirect("/");
            req.user.harvestActivity(crop, function(err) {});
        }
    });
};

exports.plot = function(req, res, next) {

    var plot = req.plot;

    async.parallel([
        function(callback) {
            if (plot.crop) {
                Crop.get(plot.crop, callback);
            } else {
                callback(null, null);
            }
        },
        function(callback) {
            Farmer.get(plot.owner, callback);
        }
    ], function(err, results) {
        var crop, farmer;

        if (err) {
            next(err);
        } else {
            crop = results[0];
            farmer = results[1];
            res.render('plotpage', {title: 'A plot by ' + farmer.name,
                                    user: req.user,
                                    farmer: farmer,
                                    plot: plot,
                                    crop: crop});
        }
    });
};

exports.crop = function(req, res, next) {

    var crop = req.crop;

    async.parallel([
        function(callback) {
            Plot.get(crop.plot, callback);
        },
        function(callback) {
            Farmer.get(crop.owner, callback);
        }
    ], function(err, results) {
        var plot, farmer;

        if (err) {
            next(err);
        } else {
            plot = results[0];
            farmer = results[1];
            res.render('croppage', {title: crop.name + ' by ' + farmer.name,
                                    user: req.user,
                                    farmer: farmer,
                                    plot: plot,
                                    crop: crop});
        }
    });
};
