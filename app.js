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
    async = require("async"),
    path = require("path"),
    _ = require("underscore"),
    express = require('express'),
    DialbackClient = require("dialback-client"),
    Logger = require("bunyan"),
    routes = require('./routes'),
    databank = require("databank"),
    uuid = require("node-uuid"),
    Databank = databank.Databank,
    DatabankObject = databank.DatabankObject,
    DatabankStore = require('connect-databank')(express),
    RequestToken = require("./models/requesttoken"),
    Farmer = require("./models/farmer"),
    Host = require("./models/host"),
    Plot = require("./models/plot"),
    Crop = require("./models/crop"),
    CropType = require("./models/croptype"),
    OpenFarmGame = require("./models/openfarmgame"),
    Notifier = require("./lib/notifier"),
    Updater = require("./lib/updater"),
    config,
    defaults = {
        port: 4000,
        address: "localhost",
        hostname: "localhost",
        driver: "disk",
        name: "Open Farm Game",
        description: "The social game that brings the excitement of subsistence farming to the social internet."
    },
    log,
    logParams = {
        name: "openfarmgame",
        serializers: {
            req: Logger.stdSerializers.req,
            res: Logger.stdSerializers.res
        }
    };

if (fs.existsSync("/etc/openfarmgame.json")) {
    config = _.defaults(JSON.parse(fs.readFileSync("/etc/openfarmgame.json")),
                        defaults);
} else {
    config = defaults;
}

if (config.logfile) {
    logParams.streams = [{path: config.logfile}];
} else if (config.nologger) {
    logParams.streams = [{path: "/dev/null"}];
} else {
    logParams.streams = [{stream: process.stderr}];
}

log = new Logger(logParams);

log.info("Initializing pump.io");

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
_.extend(config.params.schema, DatabankStore.schema);

// Now, our stuff

_.each([RequestToken, Host, Plot, Crop], function(Cls) {
    config.params.schema[Cls.type] = Cls.schema;
});

// Farmer and CropType have global lists

_.extend(config.params.schema, Farmer.schema);
_.extend(config.params.schema, CropType.schema);

var db = Databank.get(config.driver, config.params);

async.waterfall([
    function(callback) {
        log.info({driver: config.driver, params: config.params}, "Connecting to DB");
        db.connect({}, callback);
    },
    function(callback) {

        // Set global databank info

        DatabankObject.bank = db;

        // Set initial croptype data

        log.info("Setting initial crop data");

        CropType.initialData(callback);
    },
    function(callback) {

        var app,
            bounce,
            client,
            requestLogger = function(log) {
                return function(req, res, next) {
                    var weblog = log.child({"req_id": uuid.v4(), component: "web"});
                    var end = res.end;
                    req.log = weblog;
                    res.end = function(chunk, encoding) {
                        var rec;
                        res.end = end;
                        res.end(chunk, encoding);
                        rec = {req: req, res: res};
                        weblog.info(rec);
                    };
                    next();
                };
            };


        if (_.has(config, "key")) {

            log.info("Using SSL");

            app = express.createServer({key: fs.readFileSync(config.key),
                                        cert: fs.readFileSync(config.cert)});
            bounce = express.createServer(function(req, res, next) {
                var host = req.header('Host');
                res.redirect('https://'+host+req.url, 301);
            });

        } else {

            log.info("Not using SSL");

            app = express.createServer();
        }

        // Configuration

        var dbstore = new DatabankStore(db, log, 60000);

        log.info("Configuring app");

        app.configure(function(){
            app.set('views', __dirname + '/views');
            app.set('view engine', 'utml');
            app.use(requestLogger(log));
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

            var uuid = req.params.plot;

            Plot.get(uuid, function(err, plot) {
                if (err) {
                    next(err);
                } else {
                    req.plot = plot;
                    next();
                }
            });
        };

        var reqCrop = function(req, res, next) {

            var uuid = req.params.crop;

            Crop.get(uuid, function(err, crop) {
                if (err) {
                    next(err);
                } else {
                    req.crop = crop;
                    next();
                }
            });
        };

        var userIsOwner = function(req, res, next) {
            if (req.user.id == req.plot.owner) {
                next();
            } else {
                next(new Error("Must be the owner"));
            }
        };

        // Routes

        log.info("Initializing routes");

        app.get('/', userAuth, userOptional, routes.index);
        app.get('/login', userAuth, noUser, routes.login);
        app.post('/login', userAuth, noUser, routes.handleLogin);
        app.post('/logout', userAuth, userRequired, routes.handleLogout);
        app.get('/about', userAuth, userOptional, routes.about);
        app.get('/authorized/:hostname', routes.authorized);
        app.get('/farmer/:webfinger', userAuth, userOptional, routes.farmer);
        app.get('/plot/:plot', userAuth, userOptional, reqPlot, routes.plot);
        app.get('/crop/:crop', userAuth, userOptional, reqCrop, routes.crop);
        app.get('/plot/:plot/plant', userAuth, userRequired, reqPlot, userIsOwner, routes.plant);
        app.post('/plot/:plot/plant', userAuth, userRequired, reqPlot, userIsOwner, routes.handlePlant);
        app.get('/plot/:plot/tearup', userAuth, userRequired, reqPlot, userIsOwner, routes.tearUp);
        app.post('/plot/:plot/tearup', userAuth, userRequired, reqPlot, userIsOwner, routes.handleTearUp);
        app.get('/plot/:plot/water', userAuth, userRequired, reqPlot, userIsOwner, routes.water);
        app.post('/plot/:plot/water', userAuth, userRequired, reqPlot, userIsOwner, routes.handleWater);
        app.get('/plot/:plot/harvest', userAuth, userRequired, reqPlot, userIsOwner, routes.harvest);
        app.post('/plot/:plot/harvest', userAuth, userRequired, reqPlot, userIsOwner, routes.handleHarvest);
        app.get('/buy-plot', userAuth, userRequired, routes.buyPlot);
        app.post('/buy-plot', userAuth, userRequired, routes.handleBuyPlot);
        app.get('/.well-known/host-meta.json', routes.hostmeta);

        // Create a dialback client

        log.info("Initializing dialback client");

        client = new DialbackClient({
            hostname: config.hostname,
            app: app,
            bank: db,
            userAgent: "OpenFarmGame/0.1.0"
        });

        // Configure this global object

        Host.dialbackClient = client;

        // Configure the service object

        log.info({name: config.name, 
                  description: config.description, 
                  hostname: config.hostname},
                 "Initializing OpenFarmGame object");

        OpenFarmGame.name        = config.name;
        OpenFarmGame.description = config.description;
        OpenFarmGame.hostname    = config.hostname;

        OpenFarmGame.protocol = (config.key) ? "https" : "http";

        // Let Web stuff get to config

        app.config = config;

        // For sending notifications

        log.info("Initializing notifier");

        var notifier = new Notifier();

        app.notify = function(farmer, title, template, data, callback) {
            notifier.notify(farmer, title, template, data, callback);
        };

        // For handling errors

        app.log = function(obj) {
            if (obj instanceof Error) {
                log.error(obj);
            } else {
                log.info(obj);
            }
        };

        // updater -- keeps the world up-to-date
        // XXX: move to master process when clustering

        log.info("Initializing updater");

        app.updater = new Updater({notifier: notifier, log: log});

        app.updater.start();

        // Start the app

        log.info({port: config.port, address: config.address}, "Starting app listener");

        app.listen(config.port, config.address, callback);

        // Start the bouncer

        if (bounce) {
            log.info({port: 80, address: config.address}, "Starting bounce listener");
            bounce.listen(80, config.address);
        }

    }], function(err) {
        if (err) {
            log.error(err);
        } else {
            console.log("Express server listening on address %s port %d", config.address, config.port);
        }
});    
