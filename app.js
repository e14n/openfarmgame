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
    DialbackClient = require("dialback-client"),
    routes = require('./routes'),
    databank = require("databank"),
    Databank = databank.Databank,
    DatabankObject = databank.DatabankObject,
    DatabankStore = require('connect-databank')(express),
    RequestToken = require("./models/requesttoken"),
    Farmer = require("./models/farmer"),
    Host = require("./models/host"),
    OpenFarmGame = require("./models/openfarmgame"),
    config,
    defaults = {
        port: 4000,
        address: "localhost",
        hostname: "localhost",
        driver: "disk",
        name: "Open Farm Game",
        description: "The social game that brings the excitement of subsistence farming to the social internet."
    };

if (fs.existsSync("/etc/openfarmgame.json")) {
    config = _.defaults(JSON.parse(fs.readFileSync("/etc/openfarmgame.json")),
                        defaults);
} else {
    config = defaults;
}


if (!config.params) {
    if (config.driver == "disk") {
        config.params = {dir: "/var/lib/openfarmgame/"};
    } else {
        config.params = {};
    }
}

// Define the database schema

if (!config.params.schema) {
    config.params.schema = {};
}

_.extend(config.params.schema, DialbackClient.schema);

_.each([RequestToken, Farmer, Host], function(Cls) {
    config.params.schema[Cls.type] = Cls.schema;
});

var db = Databank.get(config.driver, config.params);

db.connect({}, function(err) {

    var app, client;

    if (err) {
        console.error(err);
        return;
    }

    // Set global databank info

    DatabankObject.bank = db;

    app = module.exports = express.createServer();

    config = _.defaults(config, defaults);

    // Configuration

    var dbstore = new DatabankStore(db, null, 60000);

    app.configure(function(){
        app.set('views', __dirname + '/views');
        app.set('view engine', 'utml');
        app.use(express.bodyParser());
        app.use(express.cookieParser());
        app.use(express.methodOverride());
        app.use(express.session({secret: (_(config).has('sessionSecret')) ? config.sessionSecret : "insecure",
                                 store: dbstore}));
        app.use(app.router);
        app.use(express.static(__dirname + '/public'));
    });

    app.configure('development', function(){
        app.use(express.errorHandler({ dumpExceptions: true, showStack: true }));
    });

    app.configure('production', function(){
        app.use(express.errorHandler());
    });

    // Auth middleware

    var userAuth = function(req, res, next) {

        req.user = null;
        res.local("user", null);

        if (!req.session.farmerID) {
            next();
        } else {
            Farmer.get(req.session.farmerID, function(err, farmer) {
                if (err) {
                    next(err);
                } else {
                    req.user = farmer;
                    res.local("user", farmer);
                    next();
                }
            });
        }
    };

    var userOptional = function(req, res, next) {
        next();
    };

    var userRequired = function(req, res, next) {
        if (!req.user) {
            next(new Error("User is required"));
        } else {
            next();
        }
    };

    var noUser = function(req, res, next) {
        if (req.user) {
            next(new Error("Already logged in"));
        } else {
            next();
        }
    };

    var userIsFarmer = function(req, res, next) {
        if (req.params.webfinger && req.user.id == req.params.webfinger) {
            next();
        } else {
            next(new Error("Must be the same farmer"));
        }
    };

    var reqPlot = function(req, res, next) {
        var plot = parseInt(req.params.plot, 10),
            user = req.user;

        if (plot < 0 || plot >= user.plots.length) {
            next(new Error("Invalid plot: " + plot));
            return;
        }

        req.plot = plot;
        next();
    };

    // Routes

    app.get('/', userAuth, userOptional, routes.index);
    app.get('/login', userAuth, noUser, routes.login);
    app.post('/login', userAuth, noUser, routes.handleLogin);
    app.get('/about', userAuth, userOptional, routes.about);
    app.get('/authorized/:hostname', routes.authorized);
    app.get('/farmer/:webfinger', userAuth, userOptional, routes.farmer);
    app.get('/plant/:plot', userAuth, userRequired, reqPlot, routes.plant);
    app.post('/plant/:plot', userAuth, userRequired, reqPlot, routes.handlePlant);
    app.get('/tearup/:plot', userAuth, userRequired, reqPlot, routes.tearUp);
    app.post('/tearup/:plot', userAuth, userRequired, reqPlot, routes.handleTearUp);
    app.get('/water/:plot', userAuth, userRequired, reqPlot, routes.water);
    app.post('/water/:plot', userAuth, userRequired, reqPlot, routes.handleWater);
    app.get('/.well-known/host-meta.json', routes.hostmeta);

    // Create a dialback client

    client = new DialbackClient({
        hostname: config.hostname,
        app: app,
        bank: db,
        userAgent: "OpenFarmGame/0.1.0"
    });

    // Configure this global object

    Host.dialbackClient = client;

    // Configure the service object

    OpenFarmGame.name        = config.name;
    OpenFarmGame.description = config.description;
    OpenFarmGame.hostname    = config.hostname;

    // Let Web stuff get to config

    app.config = config;

    // Start the app

    app.listen(config.port, config.address, function() {
        console.log("Express server listening on port %d in %s mode", app.address().port, app.settings.env);
    });
});
