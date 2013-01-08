// farmer.js
//
// data object representing an farmer
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
    uuid = require("node-uuid"),
    DatabankObject = require("databank").DatabankObject,
    OpenFarmGame = require("./openfarmgame"),
    Host = require("./host");

var Farmer = DatabankObject.subClass("farmer");

Farmer.schema = {
    "farmer": {
        pkey: "id",
        fields: ["name",
                 "coins",
                 "plots",
                 "token",
                 "secret",
                 "inbox",
                 "outbox",
                 "created",
                 "updated"]
    },
    "farmerlist": {
        pkey: "id"
    }
};

Farmer.fromPerson = function(person, token, secret, callback) {

    var id = person.id,
        farmer,
        bank = Farmer.bank();

    if (id.substr(0, 5) == "acct:") {
        id = id.substr(5);
    }

    if (!person.links ||
        !person.links["activity-inbox"] ||
        !person.links["activity-inbox"].href) {
        callback(new Error("No activity inbox."));
        return;
    }

    if (!person.links ||
        !person.links["activity-outbox"] ||
        !person.links["activity-outbox"].href) {
        callback(new Error("No activity inbox."));
        return;
    }

    if (!person.followers ||
        !person.followers.url) {
        callback(new Error("No followers."));
        return;
    }

    Farmer.create({id: id,
                   name: person.displayName,
                   homepage: person.url,
                   coins: 25,
                   plots: [{id: "urn:uuid:"+uuid.v4()}],
                   token: token,
                   secret: secret,
                   created: Date.now(),
                   updated: Date.now(),
                   inbox: person.links["activity-inbox"].href,
                   outbox: person.links["activity-outbox"].href,
                   followers: person.followers.url},
                  callback);
};

// Keep a list of existing farmers so we can do periodic updates

Farmer.prototype.afterCreate = function(callback) {
    var farmer = this,
        bank = Farmer.bank();

    bank.append("farmerlist", 0, farmer.id, function(err, list) {
        if (err) {
            callback(err);
        } else {
            callback(null);
        }
    });
};

// Deleted farmers come off the list

Farmer.prototype.afterDel = function(callback) {
    var farmer = this,
        bank = Farmer.bank();

    bank.remove("farmerlist", 0, farmer.id, function(err, list) {
        if (err) {
            callback(err);
        } else {
            callback(null);
        }
    });
};

Farmer.prototype.joinActivity = function(callback) {
    var farmer = this,
        game = OpenFarmGame.asService(),
        content = "<a href='" + farmer.homepage + "'>" + farmer.name + "</a> " + 
            " joined " +
            "<a href='" + game.url + "'>" + game.displayName + "</a>";

    farmer.postActivity({verb: "join",
                         content: content,
                         object: game},
                        callback);
};

Farmer.prototype.buyActivity = function(plotIndex, callback) {
    var farmer = this,
        plot = farmer.getPlot(plotIndex);

    farmer.postActivity({verb: "purchase",
                         content: farmer.name + " bought a new plot.",
                         object: Farmer.plotAsObject(plot)},
                         callback);
};

Farmer.prototype.plantActivity = function(plotIndex, callback) {
    var farmer = this,
        crop = farmer.getCrop(plotIndex);

    farmer.postActivity({verb: "http://openfarmgame.com/schema/verb/plant",
                         content: farmer.name + " planted " + crop.name,
                         object: Farmer.cropAsObject(crop)},
                         callback);
};

Farmer.prototype.tearUpActivity = function(crop, callback) {
    var farmer = this;
    farmer.postActivity({verb: "http://openfarmgame.com/schema/verb/tear-up",
                         content: farmer.name + " tore up " + crop.name,
                         object: Farmer.cropAsObject(crop)},
                         callback);
};

Farmer.prototype.waterActivity = function(plotIndex, callback) {
    var farmer = this,
        crop = farmer.getCrop(plotIndex);

    farmer.postActivity({verb: "http://openfarmgame.com/schema/verb/water",
                         content: farmer.name + " watered " + crop.name,
                         object: Farmer.cropAsObject(crop)},
                         callback);
};

Farmer.prototype.harvestActivity = function(crop, callback) {
    var farmer = this;
    farmer.postActivity({verb: "http://openfarmgame.com/schema/verb/harvest",
                         content: farmer.name + " harvested " + crop.name,
                         object: Farmer.cropAsObject(crop)},
                         callback);
};

Farmer.prototype.getCrop = function(idx) {
    var farmer = this;
    if (idx >= 0 && idx < farmer.plots.length) {
        return farmer.plots[idx].crop;
    } else {
        return null;
    }
};

Farmer.prototype.getPlot = function(idx) {
    var farmer = this;
    if (idx >= 0 && idx < farmer.plots.length) {
        return farmer.plots[idx];
    } else {
        return null;
    }
};

Farmer.cropAsObject = function(crop) {
    return {
        id: crop.id,
        objectType: "http://openfarmgame.com/schema/object-type/crop",
        displayName: crop.name
    };
};

Farmer.plotAsObject = function(plot) {
    return {
        id: plot.id,
        objectType: "http://openfarmgame.com/schema/object-type/plot",
        displayName: "a plot of land"
    };
};

Farmer.prototype.postActivity = function(act, callback) {

    var farmer = this,
        parts = farmer.id.split("@"),
        hostname = parts[1];

    async.waterfall([
        function(callback) {
            Host.get(hostname, callback);
        },
        function(host, callback) {
            var oa = host.getOAuth(),
                json = JSON.stringify(act);

            oa.post(farmer.outbox, farmer.token, farmer.secret, json, "application/json", callback);
        },
        function(data, response, callback) {
            var posted;
            if (response.statusCode >= 400 && response.statusCode < 600) {
                callback(new Error("Error " + response.StatusCode + ": " + data));
            } else if (!response.headers || 
                       !response.headers["Content-Type"] || 
                       response.headers["content-type"].substr(0, "application/json".length) != "application/json") {
                callback(new Error("Not application/json"));
            } else {
                try {
                    posted = JSON.parse(data);
                    callback(null, posted);
                } catch (e) {
                    callback(e, null);
                }
            }
        }
    ], callback);
};

module.exports = Farmer;
