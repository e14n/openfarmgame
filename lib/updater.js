// updater.js
//
// Updates the state of the world and notifies farmers of it
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
    async = require("async"),
    Farmer = require("../models/farmer"),
    Host = require("../models/host"),
    Plot = require("../models/plot"),
    Crop = require("../models/crop"),
    CropType = require("../models/croptype"),
    OpenFarmGame = require("../models/openfarmgame");

var ignore = function(err) {};

var S = 1000;
var M = 60 * S;
var H = 60 * M;

var Updater = function(options) {

    var notifier = options.notifier,
        log = options.log.child({component: "updater"}),
        logError = function(err) {
            log.error(err);
        },
        updateFarmer = function(id, callback) {
            log.info({id: id}, "Updating farmer");
            async.waterfall([
                function(callback) {
                    Farmer.get(id, callback);
                },
                function(farmer, callback) {
                    log.info({farmer: farmer}, "Got farmer");
                    _.each(farmer.plots, function(uuid) {
			log.info({farmer: farmer.id, plot: uuid}, "Queueing plot");
                        plotQueue.push(uuid, function(err) {
                            if (err) {
                                log.error(err);
                            } else {
                                log.info({plot: uuid}, "Finished updating plot");
                            }
                        });
                    });
                    callback(null);
                }
            ], callback);
        },
        notifyEmptyPlot = function(farmer, plot, callback) {
            notifier.notify(farmer, "Your plot is empty", "emptyplot", {plot: plot}, callback); 
        },
        updateEmptyPlot = function(plot, callback) {
            var now = Date.now();
            log.info("Checking empty plot");
            if (now - plot.updated > Updater.EMPTY_NOTIFICATION_TIME &&
                !plot.emptyNotified) {
                log.info("Notifying farmer of empty plot of land");
                async.waterfall([
                    function(callback) {
                        Farmer.get(plot.owner, callback);
                    },
                    function(farmer, callback) {
                        notifyEmptyPlot(farmer, plot, callback);
                    },
                    function(callback) {
                        plot.emptyNotified = now;
                        plot.save(callback);
                    }
                ], callback);
            } else {
                callback(null);
            }
            return;
        },
        updateCrop = function(uuid, callback) {

            var crop,
                type,
                farmer,
                now = Date.now();

            async.waterfall([
                function(callback) {
                    log.info({crop: uuid}, "Getting crop");
                    Crop.get(uuid, callback);
                },
                function(results, callback) {
                    crop = results;
                    log.info({type: crop.type}, "Getting crop type");
                    CropType.get(crop.type, callback);
                },
                function(results, callback) {
                    type = results;
                    log.info({farmer: crop.owner}, "Getting crop owner");
                    Farmer.get(crop.owner, callback);
                },
                function(results, callback) {
                    farmer = results;
                    log.info({type: type, crop: crop}, "Checking crop");
                    switch (crop.state) {
                    case Crop.GROWING:
                        if (crop.watered >= type.waterings) {
                            if ((now - crop.updated) >= type.ripentime * M) {
                                log.info("Setting crop state to ripe");
                                async.waterfall([
                                    function(callback) {
                                        crop.state = Crop.RIPE;
                                        crop.save(callback);
                                    },
                                    function(crop, callback) {
                                        notifier.notify(farmer,
                                                        "Your " + crop.name + " is ready to harvest",
                                                        "ripecrop",
                                                        {crop: crop},
                                                        callback); 
                                    }
                                ], callback);
                            } else {
                                log.info("No change");
                                callback(null, crop);
                            }
                        } else if (now - crop.updated > type.watertime * M) {
                            log.info("Setting crop state to needs water");
                            async.waterfall([
                                function(callback) {
                                    crop.state = Crop.NEEDS_WATER;
                                    crop.save(callback);
                                },
                                function(crop, callback) {
                                    notifier.notify(farmer,
                                                    "Your " + crop.name + " needs water",
                                                    "needswater",
                                                    {crop: crop},
                                                    callback); 
                                }
                            ], callback);
                        } else {
                            log.info("No change");
                            callback(null, crop);
                        }
                        break;
                    case Crop.NEW:         // new stuff needs water
                    case Crop.NEEDS_WATER:
                        if (now - crop.updated > type.reallywatertime * M) {
                            log.info("Setting crop state to really needs water");
                            async.waterfall([
                                function(callback) {
                                    crop.state = Crop.REALLY_NEEDS_WATER;
                                    crop.damaged = true;
                                    crop.save(callback);
                                },
                                function(crop, callback) {
                                    notifier.notify(farmer,
                                                    "Your " + crop.name + " is parched",
                                                    "reallyneedswater",
                                                    {crop: crop},
                                                    callback); 
                                }
                            ], callback);
                        } else {
                            log.info("No change");
                            callback(null, crop);
                        }
                        break;
                    case Crop.REALLY_NEEDS_WATER:
                        if (now - crop.updated > type.dehydrationtime * M) {
                            log.info("Setting crop state to dead");
                            async.waterfall([
                                function(callback) {
                                    crop.state = Crop.DEAD;
                                    crop.save(callback);
                                },
                                function(crop, callback) {
                                    notifier.notify(farmer,
                                                    "Your " + crop.name + " is dead from dehydration",
                                                    "dehydration",
                                                    {crop: crop},
                                                    callback); 
                                }
                            ], callback);
                        } else {
                            log.info("No change");
                            callback(null, crop);
                        }
                        break;
                    case Crop.RIPE:
                        if (now - crop.updated > type.overripentime * M) {
                            log.info("Setting crop state to overripe");
                            async.waterfall([
                                function(callback) {
                                    crop.state = Crop.OVERRIPE;
                                    crop.damaged = true;
                                    crop.save(callback);
                                },
                                function(crop, callback) {
                                    notifier.notify(farmer,
                                                    "Your " + crop.name + " is overripe",
                                                    "overripe",
                                                    {crop: crop},
                                                    callback); 
                                }
                            ], callback);
                        } else {
                            log.info("No change");
                            callback(null, crop);
                        }
                        break;
                    case Crop.OVERRIPE:
                        if (now - crop.updated > type.rottime * M) {
                            log.info("Setting crop state to dead");
                            async.waterfall([
                                function(callback) {
                                    crop.state = Crop.DEAD;
                                    crop.save(callback);
                                },
                                function(crop, callback) {
                                    notifier.notify(farmer,
                                                    "Your " + crop.name + " rotted in the fields",
                                                    "rotten",
                                                    {crop: crop},
                                                    callback); 
                                }
                            ], callback);
                        } else {
                            log.info("No change");
                            callback(null, crop);
                        }
                        break;
                    default:
                        log.info({state: crop.state}, "Unrecognized state");
                        callback(null, crop);
                        break;
                    }
                }
            ], callback);
        },
        updatePlot = function(uuid, callback) {

            var plot;

            log.info({plot: uuid}, "Updating plot");

            async.waterfall([
                function(callback) {
                    Plot.get(uuid, callback);
                },
                function(results, callback) {
                    plot = results;
                    if (!plot.crop) {
                        log.info({plot: uuid}, "Updating empty plot");
                        updateEmptyPlot(plot, callback);
                    } else {
                        log.info({plot: uuid, crop: plot.crop}, "Updating crop");
                        updateCrop(plot.crop, callback);
                    }
                }
            ], callback);
        },
        updateAll = function() {
            var bank = Farmer.bank();
            bank.read("farmerlist", 0, function(err, list) {
                if (err) {
                    log.info(err, "Error getting farmerlist.");
                } else if (list.length === 0) {
                    log.info("No farmers.");
                } else {
                    log.info(list, "Got farmerlist");
                    _.each(list, function(farmer) {
                        farmerQueue.push(farmer, function(err) {
                            if (err) {
                                log.info(err, err.message);
                            } else {
                                log.info({farmer: farmer}, "Finished updating");
                            }
                        });
                    });
                }
            });
        },
        queueStats = function() {
            log.info({farmers: farmerQueue.length(), plots: plotQueue.length()}, "Queue stats");
        },
        farmerQueue = async.queue(updateFarmer, 25),
        plotQueue = async.queue(updatePlot, 25);
        
    farmerQueue.drain = function() {
        log.info("Farmer queue empty;.");
    };

    plotQueue.drain = function() {
        log.info("Plot queue empty.");
    };

    this.notifier = options.notifier;

    this.start = function() {
        // Do this every 15 minutes
        setInterval(updateAll, 15 * M);
        // Do this every minute
        setInterval(queueStats, 1 * M);
        // Do one right now
        updateAll();
    };
};

Updater.EMPTY_NOTIFICATION_TIME = 24 * H;

module.exports = Updater;
