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

var DatabankObject = require("databank").DatabankObject;

var Farmer = DatabankObject.subClass("farmer");

Farmer.schema = {
    pkey: "id",
    fields: ["name",
             "coins",
             "plots",
             "token",
             "secret",
             "created",
             "updated"]
};

Farmer.fromPerson = function(person, token, secret, callback) {
    var id = person.id;
    if (id.substr(0, 5) == "acct:") {
        id = id.substr(5);
    }
    Farmer.create({id: id,
                   name: person.displayName,
                   coins: 10,
                   plots: [{}],
                   token: token,
                   secret: secret,
                   created: Date.now(),
                   updated: Date.now()},
                  callback);
};

Farmer.prototype.joinActivity = function(callback) {
    callback(null);
};

Farmer.prototype.plantActivity = function(plotIndex, callback) {
    callback(null);
};

Farmer.prototype.waterActivity = function(plotIndex, callback) {
    callback(null);
};

Farmer.prototype.harvestActivity = function(crop, callback) {
    callback(null);
};

module.exports = Farmer;
