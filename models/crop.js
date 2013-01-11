// crop.js
//
// data object representing a crop planted in a plot
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
    OpenFarmGame = require("./openfarmgame"),
    DatabankObject = require("databank").DatabankObject;

var Crop = DatabankObject.subClass("crop");

Crop.schema = {
    pkey: "uuid",
    fields: ["owner",
             "plot",
             "type",
             "state",
             "watered",
             "created",
             "updated"]
};

Crop.beforeCreate = function(props, callback) {
    props.uuid = uuid.v4();
    props.created = Date.now();
    props.updated = props.created;
    if (!props.watered) {
        props.watered = 0;
    }
    if (!props.state) {
        props.state = Crop.NEW;
    }
    console.dir(props);
    callback(null, props);
};

Crop.prototype.beforeUpdate = function(props, callback) {
    props.updated = Date.now();
    callback(null, props);
};

Crop.prototype.beforeSave = function(callback) {
    var crop = this;
    crop.updated = Date.now();
    if (!crop.created) {
        crop.created = Date.now();
    }
    if (!crop.uuid) {
        crop.uuid = uuid.v4();
        if (!crop.watered) {
            crop.watered = 0;
        }
        if (!crop.state) {
            crop.state = Crop.NEW;
        }
    }
    callback(null);
};

Crop.prototype.url = function() {
    var crop = this;
    return OpenFarmGame.url("/crop/"+crop.uuid);
};

Crop.prototype.asObject = function() {
    var crop = this;
    return {
        id: "urn:uuid:"+crop.uuid,
        objectType: "http://openfarmgame.com/schema/object-type/crop",
        url: crop.url(),
        displayName: crop.name
    };
};

Crop.prototype.status = function() {
    var crop = this,
        status;

    switch (crop.state) {
    case Crop.NEW:
        status = "New";
        break;
    case Crop.GROWING:
        status = "Growing";
        break;
    case Crop.NEEDS_WATER:
        status = "Needs water";
        break;
    case Crop.REALLY_NEEDS_WATER:
        status = "Really needs water";
        break;
    case Crop.RIPE:
        status = "Ripe";
        break;
    case Crop.OVERRIPE:
        status = "Overripe";
        break;
    case Crop.DEAD:
        status = "Dead";
        break;
    case Crop.HARVESTED:
        status = "Harvested";
        break;
    default:
        status = "(Unrecognized state '" + crop.state + "')";
        break;
    }

    return status;
};

Crop.prototype.needsWater = function() {
    var crop = this;
    return (crop.state == Crop.NEW ||
            crop.state == Crop.NEEDS_WATER ||
            crop.state == Crop.REALLY_NEEDS_WATER);
};

Crop.prototype.ready = function() {
    var crop = this;
    return (crop.state == Crop.RIPE ||
            crop.state == Crop.OVERRIPE);
};

// States

Crop.NEW = "new";
Crop.GROWING = "growing";
Crop.NEEDS_WATER = "needswater";
Crop.REALLY_NEEDS_WATER = "reallyneedswater";
Crop.RIPE = "ripe";
Crop.OVERRIPE = "overripe";
Crop.DEAD = "dead";
Crop.HARVESTED = "harvested";

module.exports = Crop;
