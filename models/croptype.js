// croptype.js
//
// data object representing a type of plant used in farming
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
    DatabankObject = require("databank").DatabankObject;

var CropType = DatabankObject.subClass("croptype");

CropType.schema = {
    "croptype": {
        pkey: "slug",
        fields: ["name",
                 "cost",
                 "price",
                 "created",
                 "updated"]
    },
    "croptypelist": {
        pkey: "dummy"
    }
};

CropType.beforeCreate = function(props, callback) {
    if (!props.slug) {
        callback(new Error("No slug!"), null);
        return;
    }
    props.created = Date.now();
    props.updated = props.created;
    callback(null, props);
};

CropType.prototype.beforeUpdate = function(props, callback) {
    if (!props.slug) {
        callback(new Error("No slug!"), null);
        return;
    }
    props.updated = Date.now();
    callback(null, props);
};

CropType.prototype.beforeSave = function(callback) {
    var type = this;
    if (!type.slug) {
        callback(new Error("No slug!"));
        return;
    }
    type.updated = Date.now();
    if (!type.created) {
        type.created = Date.now();
    }
    callback(null);
};

CropType.getAll = function(callback) {
    var bank = CropType.bank();

    async.waterfall([
        function(callback) {
            bank.read("croptypelist", 0, callback);
        },
        function(slugs, callback) {
            CropType.readArray(slugs, callback);
        }
    ], function(err, crops) {
        if (err) {
            callback(err, null);
        } else {
            _.sortBy(crops, "cost");
            callback(null, crops);
        }
    });
};

module.exports = CropType;
