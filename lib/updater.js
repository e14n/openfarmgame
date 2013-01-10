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
    fs = require("fs"),
    path = require("path"),
    async = require("async"),
    uuid = require("node-uuid"),
    Farmer = require("../models/farmer"),
    Host = require("../models/host"),
    OpenFarmGame = require("../models/openfarmgame");

var ignore = function(err) {};

var Updater = function(options) {

    var farmerQueue = async.queue(updateFarmer, 25),
        plotQueue = async.queue(updatePlot, 25),
        updateFarmer = function(id, callback) {
            async.waterfall([
                function(callback) {
                    Farmer.get(id, callback);
                },
                function(farmer, callback) {
                    _.each(farmer.plots, function(plot) {
                        plotQueue.push({plot: plot, farmer: farmer}, ignore);
                    });
                }
            ]);
        },
        updatePlot = function(task, callback) {
            var plot = task.plot,
                farmer = task.farmer,
                now = Date.now();

            if (!plot.crop) {
                if (now - plot.emptied > EMPTY_NOTIFICATION_TIME &&
                    !plot.emptyNotified) {
                    notifyEmptyPlot(farmer, plot, ignore);
                    plot.emptyNotified = true;
                    farmer.save(callback);
                }
                return;
            }

            switch (plot.crop.state) {
                case NEW:
                break;
                case GROWING:
                break;
                case NEEDS_WATER:
                break;
                case REALLY_NEEDS_WATER:
                break;
                case RIPE:
                break;
                case OVERRIPE:
                break;
                default:
                break;
            }
        },
        updateAll = function() {
            var bank = Farmer.bank();
            bank.read("farmerlist", 0, function(err, list) {
                if (err) {
                    // XXX: ???!?!
                } else {
                    farmerQueue.push(list, function() {
                        // XXX: ???!?!
                    });
                }
            });
        };
        
    farmerQueue.drain = function() {
        setTimer(updateAll, 15 * 60 * 1000);
    };

    this.notifier = options.notifier;

    this.start = function() {
        setTimer(updateAll, 15 * 60 * 1000);
    };
};

module.exports = Updater;
