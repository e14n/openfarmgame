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
var M = 1 * S; // XXX: for testing
var H = 60 * M;

var Updater = function(options) {

    var log = function(data, message) {
        if (!message) {
            message = data;
            console.log(message);
        } else {
            console.log(message + ": " + JSON.stringify(data));
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
                    async.forEach(farmer.plots,
                                  function(uuid, callback) {
                                      log({uuid: uuid}, "Getting plot");
                                      Plot.get(uuid, function(err, plot) {
                                          if (err) {
                                              callback(err);
                                          } else {
                                              log({plot: plot}, "Got plot");
                                              plotQueue.push({plot: plot, farmer: farmer}, ignore);
                                              callback(null);
                                          }
                                      });
                                  },
                                  callback);
                }
            ], callback);
        },
        notifyEmptyPlot = function(farmer, plot, callback) {
            callback(null);
        },
        updatePlot = function(task, callback) {
            var plot = task.plot,
                farmer = task.farmer,
                crop,
                type,
                now = Date.now();

            log({plot: plot}, "Updating plot");

            if (!plot.crop) {
                log("Checking empty plot");
                if (now - plot.updated > Updater.EMPTY_NOTIFICATION_TIME &&
                    !plot.emptyNotified) {
                    log("Notifying farmer of empty plot");
                    notifyEmptyPlot(farmer, plot, ignore);
                }
                return;
            }

            async.waterfall([
                function(callback) {
                    log({crop: plot.crop}, "Getting crop");
                    Crop.get(plot.crop, callback);
                },
                function(results, callback) {
                    crop = results;
                    log({type: crop.type}, "Getting crop type");
                    CropType.get(crop.type, callback);
                },
                function(results, callback) {
                    type = results;
                    log({type: type, crop: crop}, "Checking crop");
                    switch (crop.state) {
                    case Crop.GROWING:
                        if (crop.watered >= type.waterings && (now - crop.updated) >= type.ripentime * M) {
                            log("Setting crop state to ripe");
                            crop.state = Crop.RIPE;
                            crop.save(callback);
                        } else if (now - crop.updated > type.watertime * M) {
                            log("Setting crop state to needs water");
                            crop.state = Crop.NEEDS_WATER;
                            crop.save(callback);
                        } else {
                            log("No change");
                            callback(null, crop);
                        }
                        break;
                    case Crop.NEW:         // new stuff needs water
                    case Crop.NEEDS_WATER:
                        if (now - crop.updated > type.reallywatertime * M) {
                            log("Setting crop state to really needs water");
                            crop.state = Crop.REALLY_NEEDS_WATER;
                            crop.damaged = true;
                            crop.save(callback);
                        } else {
                            log("No change");
                            callback(null, crop);
                        }
                        break;
                    case Crop.REALLY_NEEDS_WATER:
                        if (now - crop.updated > type.dehydrationtime * M) {
                            log("Setting crop state to dead");
                            crop.state = Crop.DEAD;
                            crop.save(callback);
                        } else {
                            log("No change");
                            callback(null, crop);
                        }
                        break;
                    case Crop.RIPE:
                        if (now - crop.updated > type.overripentime * M) {
                            log("Setting crop state to overripe");
                            crop.state = Crop.OVERRIPE;
                            crop.damaged = true;
                            crop.save(callback);
                        } else {
                            log("No change");
                            callback(null, crop);
                        }
                        break;
                    case Crop.OVERRIPE:
                        if (now - crop.updated > type.rottime * M) {
                            log("Setting crop state to dead");
                            crop.state = Crop.DEAD;
                            crop.save(callback);
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
        updateAll = function() {
            var bank = Farmer.bank();
            bank.read("farmerlist", 0, function(err, list) {
                if (err) {
                    log(err, "Error getting farmerlist");
                    reset();
                } else if (list.length == 0) {
                    reset();
                } else {
                    log(list, "Got farmerlist");
                    farmerQueue.push(list, ignore);
                }
            });
        },
        reset = function() {
            setTimeout(updateAll, 15 * M);
        },
        farmerQueue = async.queue(updateFarmer, 25),
        plotQueue = async.queue(updatePlot, 25);
        
        
    farmerQueue.drain = function() {
        reset();
    };

    this.notifier = options.notifier;

    this.start = function() {
        reset();
    };
};

Updater.EMPTY_NOTIFICATION_TIME = 24 * H;

module.exports = Updater;
