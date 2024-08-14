'use strict';

/**
 * This is the Form.io application server.
 */
const express = require('express');
const nunjucks = require('nunjucks');
const fs = require('fs-extra');
const path = require('path');
const util = require('./src/util/util');
require('colors');
const cors = require('cors');
const test = process.env.TEST_SUITE;
const noInstall = process.env.NO_INSTALL;

Promise.deferred = function() {
  let result = {};
  result.promise = new Promise(function(resolve, reject) {
    result.resolve = resolve;
    result.reject = reject;
  });
  return result;
};

module.exports = function(options) {
  options = options || {};
  const q = new Promise.deferred();

  util.log('');
  const rl = require('readline').createInterface({
    input: require('fs').createReadStream('logo.txt')
  });

  rl.on('line', function(line) {
    util.log(
      line.substring(0,4) +
      line.substring(4, 30).cyan.bold +
      line.substring(30, 33) +
      line.substring(33, 42).green.bold +
      line.substring(42)
    );
  });

  rl.on('close', function() {
    // Print the welcome screen.
    util.log('');
    util.log(fs.readFileSync('welcome.txt').toString().green);
  });

  // Use the express application.
  const app = options.app || express();

  // Use the given config.
  const config = options.config || require('config');

  // Configure nunjucks.
  nunjucks.configure('client', {
    autoescape: true,
    express: app
  });

  //cors configuration
  if (config.allowedOrigins) {
    app.use(cors({
      origin: function(origin, callback) {
        if (!origin) {
          return callback(null, true);
        }
        if (config.allowedOrigins.indexOf(origin) === -1 && config.allowedOrigins.indexOf("*") === -1) {
          var msg = 'The CORS policy for this site does not allow access from the specified Origin.';
          return callback(new Error(msg), false);
        }
        return callback(null, true);
      }
    }));
  }
  // Mount the client application.
  app.use('/', express.static(path.join(__dirname, '/portal/dist')));

  // Load the form.io server.
  const server = options.server || require('./index')(config);
  const hooks = options.hooks || {};

  app.use(server.formio.middleware.restrictRequestTypes);
  server.init(hooks).then(function(formio) {
    // Called when we are ready to start the server.
    const start = function() {
      // Mount the Form.io API platform.
      app.use(options.mount || '/', server);

      // Allow tests access server internals.
      app.formio = formio;

      // Listen on the configured port.
      return q.resolve({
        server: app,
        config: config
      });
    };

    // Which items should be installed.
    const install = {
      import: false,
      user: false
    };

    // See if they have any forms available.
    formio.db.collection('forms').estimatedDocumentCount(function(err, numForms) {
      // If there are forms, then go ahead and start the server.
      if ((!err && numForms > 0) || test || noInstall) {
        return start();
      }

      // Import the project and create the user.
      install.import = true;
      install.user = true;

      // Install.
      require('./install')(formio, install, function(err) {
        if (err) {
          if (err !== 'Installation canceled.') {
            return util.log(err.message);
          }
        }

        // Start the server.
        start();
      });
    });
  });

  return q.promise;
};
