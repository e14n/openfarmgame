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
    Host = require("./host"),
    Plot = require("./plot");

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

    async.waterfall([
        function(callback) {
            Plot.create({owner: id}, callback);
        },
        function(plot, callback) {
            Farmer.create({id: id,
                           name: person.displayName,
                           homepage: person.url,
                           coins: 25,
                           plots: [plot.uuid],
                           token: token,
                           secret: secret,
                           created: Date.now(),
                           updated: Date.now(),
                           inbox: person.links["activity-inbox"].href,
                           outbox: person.links["activity-outbox"].href,
                           followers: person.followers.url},
                          callback);
        }
    ], callback);
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
    var farmer = this;

    async.parallel([
        function(callback) {
            var bank = Farmer.bank();
            bank.remove("farmerlist", 0, farmer.id, callback);
        },
        function(callback) {
            var bank = Plot.bank();
            async.forEach(farmer.plots,
                          function(plotID, callback) {
                              bank.del("plot", plotID, callback);
                          },
                          callback);
        }
    ], function(err, results) {
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

Farmer.prototype.buyActivity = function(plot, callback) {
    var farmer = this,
        obj = plot.asObject(),
        content = "<a href='" + farmer.homepage + "'>" + farmer.name + "</a> " + 
            " bought " + 
            "<a href='" + obj.url + "'>a new plot</a>";

    farmer.postActivity({verb: "purchase",
                         content: content,
                         object: obj},
                         callback);
};

Farmer.prototype.plantActivity = function(crop, callback) {
    var farmer = this,
        obj = crop.asObject(),
        content = "<a href='" + farmer.homepage + "'>" + farmer.name + "</a> " + 
            " planted " + 
            "<a href='" + obj.url + "'>" + obj.displayName + "</a>";

    farmer.postActivity({verb: "http://openfarmgame.com/schema/verb/plant",
                         content: content,
                         object: obj},
                         callback);
};

Farmer.prototype.tearUpActivity = function(crop, callback) {
    var farmer = this,
        obj = crop.asObject(),
        content = "<a href='" + farmer.homepage + "'>" + farmer.name + "</a> " + 
            " tore up a field of " + 
             obj.displayName;

    farmer.postActivity({verb: "http://openfarmgame.com/schema/verb/tear-up",
                         content: content,
                         object: obj},
                         callback);
};

Farmer.prototype.waterActivity = function(crop, callback) {
    var farmer = this,
        obj = crop.asObject(),
        content = "<a href='" + farmer.homepage + "'>" + farmer.name + "</a> " + 
            " watered " + 
            "<a href='" + obj.url + "'>" + obj.displayName + "</a>";

    farmer.postActivity({verb: "http://openfarmgame.com/schema/verb/water",
                         content: content,
                         object: obj},
                         callback);
};

Farmer.prototype.harvestActivity = function(crop, callback) {
    var farmer = this,
        obj = crop.asObject(),
        content = "<a href='" + farmer.homepage + "'>" + farmer.name + "</a> " + 
            " harvested " + 
            "<a href='" + obj.url + "'>" + obj.displayName + "</a>";

    farmer.postActivity({verb: "http://openfarmgame.com/schema/verb/harvest",
                         content: content,
                         object: obj},
                         callback);
};

Farmer.getHostname = function(id) {
    var parts = id.split("@"),
        hostname = parts[1].toLowerCase();

    return hostname;
};

Farmer.prototype.getHost = function(callback) {

    var farmer = this,
        hostname = Farmer.getHostname(farmer.id);

    Host.get(hostname, callback);
};

Farmer.prototype.postActivity = function(act, callback) {

    var farmer = this;

    async.waterfall([
        function(callback) {
            farmer.getHost(callback);
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
                       !response.headers["content-type"] || 
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
