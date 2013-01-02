/*
 * GET home page.
 */

exports.index = function(req, res) {
    res.render('index', { title: 'Open Farm Game' });
};

exports.login = function(req, res) {
    res.render('login', { title: 'Login' });
};

exports.about = function(req, res) {
    res.render('about', { title: 'About Open Farm Game' });
};

exports.handleLogin = function(req, res, next) {
    var webfinger = req.body.webfinger;
    
    if (!webfinger) {
        next(new Error("No such webfinger"));
        return;
    }

    // Pretend they're logged in

    res.redirect("/farmer/"+webfinger, 303);
};

exports.farmer = function(req, res, next) {

    var webfinger = req.params.webfinger,
        farmer = testFarmer(webfinger);

    res.render('farmer', { title: 'Farmer ' + farmer.name, farmer: farmer });
};

exports.plant = function(req, res, next) {
    var webfinger = req.params.webfinger,
        plot = req.params.plot,
        farmer = testFarmer(webfinger),
        crops = testCrops();

    res.render('plant', { title: 'Plant a new crop', farmer: farmer, plot: plot, crops: crops });
};

exports.handlePlant = function(req, res, next) {
    var webfinger = req.body.webfinger,
        plot = req.body.plot,
        farmer = testFarmer(webfinger),
        crops = testCrops();

    res.redirect("/farmer/"+webfinger, 303);
};

var testFarmer = function(webfinger) {
    return {
        id: webfinger,
        name: "Test Farmer",
        coins: 10,
        plots: [
            {
                id: "tag:openfarmgame.com,2013:"+webfinger+":plot:1",
                crop: {
                    id: "tag:openfarmgame.com,2013:"+webfinger+":crop:corn:1",
                    name: "Corn",
                    status: "New",
                    needsWater: true
                }
            },
            {
                id: "tag:openfarmgame.com,2013:"+webfinger+":plot:2",
                crop: {
                    id: "tag:openfarmgame.com,2013:"+webfinger+":crop:tomatoes:3",
                    name: "Tomatoes",
                    status: "Ready",
                    ready: true
                }
            },
            {
            },
            {
            },
            {
            }
        ]
    };
};

var testCrops = function() {
    return [
        {
            name: "Corn",
            cost: 5,
            price: 18
        },
        {
            name: "Tomatoes",
            cost: 3,
            price: 10
        }
    ];
};