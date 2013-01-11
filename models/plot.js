// plot.js
//
// data object representing a plot of land
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

var Plot = DatabankObject.subClass("plot");

Plot.schema = {
    pkey: "uuid",
    fields: ["owner",
             "crop",
             "created",
             "updated"]
};

Plot.beforeCreate = function(props, callback) {
    props.uuid = uuid.v4();
    props.created = Date.now();
    props.updated = props.created;
    callback(null, props);
};

Plot.prototype.beforeUpdate = function(props, callback) {
    props.updated = Date.now();
    callback(null, props);
};

Plot.prototype.beforeSave = function(callback) {
    var plot = this;
    plot.updated = Date.now();
    if (!plot.created) {
        plot.created = Date.now();
    }
    if (!plot.uuid) {
        plot.uuid = uuid.v4();
    }
    callback(null);
};

Plot.prototype.url = function(callback) {
    var plot = this;
    return OpenFarmGame.url("/plot/"+plot.uuid);
};

Plot.prototype.asObject = function() {
    var plot = this;
    return {
        id: "urn:uuid:"+plot.uuid,
        objectType: "http://openfarmgame.com/schema/object-type/plot",
        displayName: "a plot of land",
        url: plot.url()
    };
};

module.exports = Plot;
