'use strict';

const Crypto = require('crypto');

class Server {

  constructor(options) {
    this.http = require('http').createServer();
    this.io = require('socket.io')(this.http);
    this.rx = this.io.of('/rx').on('connection', this._rxHandler.bind(this));
    this.tx = this.io.of('/tx').on('connection', this._txHandler.bind(this));

    this.channels = {};
    this.stats = {
      channels: 0
    };

    this.config = {
      maxChannels: 8,
      maxClients: 4
    };

    if (options && typeof options === 'object') {
      this.config.maxChannels = options.maxChannels
       || this.config.maxChannels;
      this.config.maxClients = options.maxClients
       || this.config.maxClients;
    }
  }

  _txHandler(socket) {
    const debug = require('debug')('tx');
    debug('connection');

    if (Object.keys(this.channels).length >= this.config.maxChannels) {
      return socket.emit('err', new Error('channels limit reached'));
    }

    const cid = Crypto.randomBytes(8).toString('hex');

    this.channels[cid] = {
      active: false,
      clients: 0,
      stats: {
        bytesIn: 0,
        bytesOut: 0,
        connections: 0
      }
    };

    ++this.stats.channels;

    socket.on('disconnect', () => {
      if (!this.channels[cid]) return;
      this.rx.to(cid).emit('eot');
      delete this.channels[cid];
    });

    socket.on('config', (config) => {
      if (!this.channels[cid]) {
        socket.emit('err', new Error('invalid channel'));
        return socket.disconnect();
      }

      if (this.channels[cid].active) {
        socket.emit('err', new Error('channel is active'));
        return socket.disconnect();
      }

      this.channels[cid].active = true;
      this.channels[cid].config = config;

      socket.emit('channel', cid);
    });

    socket.on('audio', (data) => {
      if (!this.channels[cid]) {
        socket.emit('err', new Error('invalid channel'));
        return socket.disconnect();
      }

      if (!this.channels[cid].active) {
        socket.emit('err', new Error('channel has not been configured'));
        return socket.disconnect();
      }

      let bytes = 0;
      for (let i = 0; i < data.length; ++i) {
        bytes += data[i].byteLength;
      }

      this.channels[cid].stats.bytesIn += bytes;
      this.channels[cid].stats.bytesOut += (bytes * this.channels[cid].clients);

      this.rx.to(cid).compress(false).emit('audio', data);
    });
  }

  _rxHandler(socket) {
    const debug = require('debug')('rx');
    debug('connection');
    socket.on('channel', (cid) => {

      if (!this.channels[cid] || !this.channels[cid].active) {
        socket.emit('err', new Error('invalid channel'));
        return socket.disconnect();
      }

      if (this.channels[cid].clients >= this.config.maxClients) {
        socket.emit('err',  new Error('listeners limit reached'));
        return socket.disconnect();
      }

      ++this.channels[cid].clients;
      ++this.channels[cid].stats.connections;
      socket.join(cid);
      socket.emit('config', this.channels[cid].config);

      socket.on('disconnect', () => {
        if (!this.channels[cid]) return;
        --this.channels[cid].clients;
      });

    });
  }

  listen(port, hostname) {
    this.http.listen(port, hostname);
  }

}

module.exports = Server;
