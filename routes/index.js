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

    res.redirect("/farmer/"+webfinger);
};

exports.farmer = function(req, res, next) {

    var webfinger = req.params.webfinger,
        farmer = {
            id: webfinger,
            name: "Test Farmer",
            coins: 10,
            plots: [
                {
                    id: "tag:openfarmgame.com,2013:"+webfinger+":plot:1",
                    crop: {
                        id: "tag:openfarmgame.com,2013:"+webfinger+":crop:corn:1",
                        name: "Corn",
                        status: "New"
                    }
                },
                {
                    id: "tag:openfarmgame.com,2013:"+webfinger+":plot:2",
                    crop: {
                        id: "tag:openfarmgame.com,2013:"+webfinger+":crop:tomatoes:3",
                        name: "Tomatoes",
                        status: "Almost ready"
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

    res.render('farmer', { title: 'Farmer ' + farmer.name, farmer: farmer });
};
