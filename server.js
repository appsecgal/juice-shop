/*jslint node: true */
'use strict';

var application_root = __dirname.replace(/\\/g, '/'),
    fs = require('fs'),
    glob = require('glob'),
    morgan = require('morgan'),
    restful = require('sequelize-restful'),
    express = require('express'),
    errorhandler = require('errorhandler'),
    cookieParser = require('cookie-parser'),
    serveIndex = require('serve-index'),
    favicon = require('serve-favicon'),
    bodyParser = require('body-parser'),
    middleware = require('./routes/middleware'),
    user = require('./routes/user'),
    shop = require('./routes/shop'),
    utils = require('./lib/utils'),
    insecurity = require('./lib/insecurity'),
    models = require('./models'),
    datacreator = require('./lib/datacreator'),
    app = express();

errorhandler.title = 'Juice Shop (Express ' + utils.version('express') + ')';

/* Delete old order PDFs */
glob(__dirname + '/app/public/ftp/*.pdf', function (err, files) {
    files.forEach(function(filename) {
        fs.unlink(filename);
    });
});

/* Favicon */
app.use(favicon(__dirname + '/app/public/favicon.ico'));

/* Checks for utils.solved challenges */
app.use(middleware.verifyDatabaseRelatedChallenges());
app.use('/public/images/tracking', middleware.verifyAccessControlChallenges());

/* public/ftp directory browsing and file download */
app.use('/public/ftp', serveIndex('app/public/ftp', {'icons': true}));
app.use('/public/ftp/:file', middleware.serveFiles());

app.use(express.static(application_root + '/app'));
app.use(morgan('dev'));
app.use(cookieParser('kekse'));
app.use(bodyParser.json());

/* Authorization */
/* Baskets: Unauthorized users are not allowed to access baskets */
app.use('/rest/basket', insecurity.isAuthorized());
/* BasketItems: API only accessible for authenticated users */
app.use('/api/BasketItems', insecurity.isAuthorized());
app.use('/api/BasketItems/:id', insecurity.isAuthorized());
/* Feedbacks: GET allowed for feedback carousel, POST allowed in order to provide feedback without being logged in */
app.use('/api/Feedbacks/:id', insecurity.isAuthorized());
/* Users: Only POST is allowed in order to register a new uer */
app.get('/api/Users', insecurity.isAuthorized());
app.get('/api/Users/:id', insecurity.isAuthorized());
app.put('/api/Users/:id', insecurity.isAuthorized());
app.delete('/api/Users/:id', insecurity.denyAll()); // Deleting users is forbidden entirely to keep login challenges solvable
/* Products: Only GET is allowed in order to view products */
app.post('/api/Products', insecurity.isAuthorized());
//app.put('/api/Products/:id', insecurity.isAuthorized()); // = missing function-level access control vulnerability
app.delete('/api/Products/:id', insecurity.denyAll()); // Deleting products is forbidden entirely to keep the O-Saft url-change challenge solvable
/* Challenges: GET list of challenges allowed. Everything else forbidden independent of authorization (hence the random secret) */
app.post('/api/Challenges', insecurity.denyAll());
app.use('/api/Challenges/:id', insecurity.denyAll());
/* REST API */
app.use('/rest/user/authentication-details', insecurity.isAuthorized());
app.use('/rest/basket/:id', insecurity.isAuthorized());
app.use('/rest/basket/:id/order', insecurity.isAuthorized());

/* Challenge evaluation before sequelize-restful takes over */
app.post('/api/Feedbacks', middleware.verifyForgedFeedbackChallenge());

/* Sequelize Restful APIs */
app.use(restful(models.sequelize, { endpoint: '/api', allowed: ['Users', 'Products', 'Feedbacks', 'BasketItems', 'Challenges'] }));
/* Custom Restful API */
app.post('/rest/user/login', user.login());
app.get('/rest/user/change-password', user.changePassword());
app.get('/rest/user/whoami', user.retrieveLoggedInUsersId());
app.get('/rest/user/authentication-details', user.retrieveUserList());
app.get('/rest/product/search', shop.searchProducts());
app.get('/rest/basket/:id', shop.retrieveBasket());
app.post('/rest/basket/:id/checkout', shop.placeOrder());
app.get('/rest/admin/application-version', middleware.retrieveAppVersion());
app.get('/redirect', middleware.performRedirect());
/* File Serving */
app.get('/the/devs/are/so/funny/they/hid/an/easter/egg/within/the/easter/egg', middleware.serveEasterEgg());
app.use(middleware.serveAngularClient());
/* Error Handling */
app.use(middleware.verifyErrorHandlingChallenge());
app.use(errorhandler());

exports.start = function (config, readyCallback) {
    if (!this.server) {
        models.sequelize.drop();
        models.sequelize.sync().success(function() {
            datacreator();
            this.server = app.listen(config.port, function () {
                console.log('Listening on port %d', config.port);
                // callback to call when the server is ready
                if (readyCallback) {
                    readyCallback();
                }
            });
        });
    }
};

exports.close = function (exitCode) {
    this.server.close();
    if (exitCode && exitCode !== 0) {
        process.exit(exitCode);
    }
};
