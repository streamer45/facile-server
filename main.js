'use strict';

const FacileServer = require('./server');
const Config = require('./config');

const server = new FacileServer({
  limits: {
    maxChannels: Config.maxChannels,
    maxClients: Config.maxClients
  }
});

server.listen(Config.port, '127.0.0.1');
