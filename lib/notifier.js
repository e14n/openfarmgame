// notifier.js
//
// Notifies farmers of changes in the state of the game
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

var Notifier = function(options) {

    // Private methods

    var templates = {},
        getTemplate = function(template, callback) {
            if (_.has(templates, template)) {
                callback(null, templates[template]);
            } else {
                compileTemplate(template, callback);
            }
        },
        compileTemplate = function(template, callback) {
            async.waterfall([
                function(callback) {
                    var fname = path.join(__dirname, "..", "notifications", template + ".utml");
                    fs.readFile(fname, "utf8", callback);
                },
                function(contents, callback) {
                    var fn = _.template(contents);
                    templates[template] = fn;
                    callback(null, fn);
                }
            ], callback);
        },
        renderTemplate = function(template, data, callback) {
            getTemplate(template, function(err, fn) {
                var html;

                if (err) {
                    callback(err, null); 
                } else {
                    try {
                        html = fn(data);
                        callback(null, html);
                    } catch(e) {
                        callback(e, null);
                    }
                }
            });
        },
        sendNote = function(farmer, title, content, callback) {
            async.waterfall([
                function(callback) {
                    farmer.getHost(callback);
                },
                function(host, callback) {
                    var oa = host.getOAuth(),
                        now = new Date(),
                        act = {
                            id: "urn:uuid:"+uuid.v4(),
                            actor: OpenFarmGame.asService(),
                            verb: "post",
                            to: [{id: "acct:" + farmer.id,
                                  objectType: "person"}],
                            object: {
                                id: "urn:uuid:"+uuid.v4(),
                                objectType: "note",
                                displayName: title,
                                content: content,
                                published: now.toISOString()
                            },
                            published: now.toISOString()
                        };

                    oa.post(farmer.inbox, null, null, JSON.stringify(act), "application/json", callback);
                }
            ], function(err, data, response) {
                if (err) {
                    callback(err);
                } else if (response.statusCode >= 400 && response.statusCode < 600) {
                    callback(new Error("HTTP error " + response.statusCode + ": " + data));
                } else {
                    callback(null);
                }
            });
        };

    // Initialize contents

    this.options = options || {};

    // Privileged method

    this.notify = function(farmer, title, template, data, callback) {
        var notifier = this;

        async.waterfall([
            function(callback) {
                var ext = _.clone(data);

                ext.game   = OpenFarmGame.asService();
                ext.farmer = farmer;

                renderTemplate(template, ext, callback);
            },
            function(contents, callback) {
                sendNote(farmer, title, contents, callback);
            }
        ], callback);
    };
};

module.exports = Notifier;
