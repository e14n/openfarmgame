// app.js
//
// main function for open farm game
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

var fs = require("fs"),
    path = require("path"),
    _ = require("underscore"),
    express = require('express'),
    routes = require('./routes'),
    config,
    defaults = {
        port: 4000,
        address: "localhost",
        hostname: "localhost"
    },
    app;

if (fs.existsSync("/etc/openfarmgame.json")) {
    config = _.defaults(JSON.parse(fs.readFileSync("/etc/openfarmgame.json")),
                        defaults);
} else {
    config = defaults;
}

app = module.exports = express.createServer();

config = _.defaults(config, defaults);

// Configuration

app.configure(function(){
  app.set('views', __dirname + '/views');
  app.set('view engine', 'utml');
  app.use(express.bodyParser());
  app.use(express.methodOverride());
  app.use(app.router);
  app.use(express.static(__dirname + '/public'));
});

app.configure('development', function(){
  app.use(express.errorHandler({ dumpExceptions: true, showStack: true }));
});

app.configure('production', function(){
  app.use(express.errorHandler());
});

// Routes

app.get('/', routes.index);

app.listen(config.port, config.address, function() {
  console.log("Express server listening on port %d in %s mode", app.address().port, app.settings.env);
});
