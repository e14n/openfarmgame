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
        log = function(data, message) {
            if (!message) {
                message = data;
                console.log(message);
            } else {
                console.log(message + ": " + JSON.stringify(data));
            }
        },
        logError = function(err) {
            if (err) {
                log(err, err.message);
            }
        },
        updateFarmer = function(id, callback) {
            log({id: id}, "Updating farmer");
            async.waterfall([
                function(callback) {
                    Farmer.get(id, callback);
                },
                function(farmer, callback) {
                    log({farmer: farmer}, "Got farmer");
                    _.each(farmer.plots, function(uuid) {
                        plotQueue.push(uuid, function(err) {
                            if (err) {
                                log(err, err.message);
                            } else {
                                log({plot: uuid}, "Finished updating plot");
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
            log("Checking empty plot");
            if (now - plot.updated > Updater.EMPTY_NOTIFICATION_TIME &&
                !plot.emptyNotified) {
                log("Notifying farmer of empty plot of land");
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
                    }], logError);
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
                    log({crop: uuid}, "Getting crop");
                    Crop.get(uuid, callback);
                },
                function(results, callback) {
                    crop = results;
                    log({type: crop.type}, "Getting crop type");
                    CropType.get(crop.type, callback);
                },
                function(results, callback) {
                    type = results;
                    log({farmer: crop.owner}, "Getting crop owner");
                    Farmer.get(crop.owner, callback);
                },
                function(results, callback) {
                    farmer = results;
                    log({type: type, crop: crop}, "Checking crop");
                    switch (crop.state) {
                    case Crop.GROWING:
                        if (crop.watered >= type.waterings && (now - crop.updated) >= type.ripentime * M) {
                            log("Setting crop state to ripe");
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
                        } else if (now - crop.updated > type.watertime * M) {
                            log("Setting crop state to needs water");
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
                            log("No change");
                            callback(null);
                        }
                        break;
                    case Crop.NEW:         // new stuff needs water
                    case Crop.NEEDS_WATER:
                        if (now - crop.updated > type.reallywatertime * M) {
                            log("Setting crop state to really needs water");
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
                            log("No change");
                            callback(null, crop);
                        }
                        break;
                    case Crop.REALLY_NEEDS_WATER:
                        if (now - crop.updated > type.dehydrationtime * M) {
                            log("Setting crop state to dead");
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
                            log("No change");
                            callback(null, crop);
                        }
                        break;
                    case Crop.RIPE:
                        if (now - crop.updated > type.overripentime * M) {
                            log("Setting crop state to overripe");
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
                            log("No change");
                            callback(null, crop);
                        }
                        break;
                    case Crop.OVERRIPE:
                        if (now - crop.updated > type.rottime * M) {
                            log("Setting crop state to dead");
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
                            log("No change");
                            callback(null, crop);
                        }
                        break;
                    default:
                        log({state: crop.state}, "Unrecognized state");
                        callback(null, crop);
                        break;
                    }
                }
            ], callback);
        },
        updatePlot = function(uuid, callback) {

            var plot;

            log({plot: uuid}, "Updating plot");

            async.waterfall([
                function(callback) {
                    Plot.get(uuid, callback);
                },
                function(results, callback) {
                    plot = results;
                    if (!plot.crop) {
                        log({plot: uuid}, "Updating empty plot");
                        updateEmptyPlot(plot, callback);
                    } else {
                        log({plot: uuid, crop: plot.crop}, "Updating crop");
                        updateCrop(plot.crop, callback);
                    }
                }
            ], callback);
        },
        updateAll = function() {
            var bank = Farmer.bank();
            bank.read("farmerlist", 0, function(err, list) {
                if (err) {
                    log(err, "Error getting farmerlist.");
                } else if (list.length === 0) {
                    log("No farmers.");
                } else {
                    log(list, "Got farmerlist");
                    _.each(list, function(farmer) {
                        farmerQueue.push(farmer, function(err) {
                            if (err) {
                                log(err, err.message);
                            } else {
                                log({farmer: farmer}, "Finished updating");
                            }
                        });
                    });
                }
            });
        },
        farmerQueue = async.queue(updateFarmer, 25),
        plotQueue = async.queue(updatePlot, 25);
        
    farmerQueue.drain = function() {
        log("Farmer queue empty;.");
    };

    plotQueue.drain = function() {
        log("Plot queue empty.");
    };

    this.notifier = options.notifier;

    this.start = function() {
        // Do this every 15 minutes
        setInterval(updateAll, 15 * M);
        // Do one right now
        updateAll();
    };
};

Updater.EMPTY_NOTIFICATION_TIME = 24 * H;

module.exports = Updater;
