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
    DatabankObject = require("databank").DatabankObject;

var Crop = DatabankObject.subClass("crop");

Crop.schema = {
    pkey: "uuid",
    fields: ["owner",
             "plot",
             "type",
             "state",
             "created",
             "updated"]
};

Crop.beforeCreate = function(props, callback) {
    props.uuid = uuid.v4();
    props.created = Date.now();
    props.updated = props.created;
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
    }
    callback(null);
};

Crop.prototype.asObject = function() {
    var crop = this;
    return {
        id: "urn:uuid:"+crop.uuid,
        objectType: "http://openfarmgame.com/schema/object-type/crop",
        displayName: crop.name
    };
};

module.exports = Crop;
