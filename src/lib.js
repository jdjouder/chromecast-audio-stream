import express from 'express';
import path from 'path';
import ffmpeg from 'fluent-ffmpeg';
import Promise from 'bluebird';
import mdns from 'mdns-js';
import os from 'os';
import net from 'net';
import async from 'async';
import util from 'util';
import {
    EventEmitter
}
from 'events';
import getPort from 'get-port';

try {
    var wincmd = require('node-windows');
} catch (ex) {
    var wincmd = null;
}

import {
    Client as castv2Client,
    DefaultMediaReceiver as castv2DefaultMediaReceiver
}
from 'castv2-client';

const app = express();

app.get('/', (req, res) => {
    req.connection.setTimeout(Number.MAX_SAFE_INTEGER);
    console.log("Device requested: /");
    let command = ffmpeg();

    command.setFfmpegPath(path.join(process.cwd(), 'ffmpeg'));
    command.input('audio=virtual-audio-capturer')
    command.inputFormat('dshow')
    command.audioCodec("libmp3lame")
    command.outputFormat("mp3")
        .on('start', commandLine => {
            console.log('Spawned Ffmpeg with command: ' + commandLine);
        })
        .on('error', (err, one, two) => {
            console.log('An error occurred: ' + err.message);
            console.log(two);
        })
        .on('end', () => {
            console.log("end");
            res.end();
        })

    let ffstream = command.pipe();
    ffstream.on('data', res.write.bind(res));
});



class App extends EventEmitter {
    constructor(props) {
        super();

        this.port = false;
        this.devices = [];
        this.server = false;
    }

    get port() {
        return this.port;
    }

    setupServer() {
        return new Promise((resolve, reject) => {
            getPort()
                .then(port => {
                    this.port = port;
                    this.server = app.listen(port, () => {
                        console.info('Example app listening at http://%s:%s', this.getIp(), port);
                    });
                    resolve()
                })
                .catch(reject);
        });
    }

    detectVirtualAudioDevice(redetection) {
        let command = ffmpeg("dummy");
        command.setFfmpegPath(path.join(process.cwd(), 'ffmpeg'));
        command.inputOptions([
            "-list_devices true",
            "-f dshow",
        ])
        return new Promise((resolve, reject) => {
            command.outputOptions([])
                .on('start', commandLine => {
                    console.log('Spawned Ffmpeg with command: ' + commandLine);
                })
                .on('error', (err, one, two) => {
                    console.log('An error occurred: ' + err.message);
                    if (one, two) {
                        if (two.indexOf("virtual-audio-capturer") > -1) {
                            console.log("VIRTUAL DEVICE FOUND");
                            resolve();
                        } else if (redetection) {
                            let err = "Please re-run application and temporarily allow Administrator to install Virtual Audio Driver.";
                            console.log(err);
                            reject(err);
                        } else {
                            reject('NOPERMS');
                        }
                    }
                })
                .on('end', console.log.bind(this, 'end'))
            let ffstream = command.pipe();
        });

    }
    ondeviceup(host, name) {
        if (this.devices.indexOf(host) == -1) {
            this.devices.push(host);
            console.info("ondeviceup", host, this.devices);
            this.emit("deviceFound", host, name);
        }
    }
    static getIp() {
        const ip = false
        var alias = 0;
        let ifaces = os.networkInterfaces();
        for (var dev in ifaces) {
            ifaces[dev].forEach(details => {
                if (details.family === 'IPv4') {
                    if (!/(loopback|vmware|internal|hamachi|vboxnet)/gi.test(dev + (alias ? ':' + alias : ''))) {
                        if (details.address.substring(0, 8) === '192.168.' ||
                            details.address.substring(0, 7) === '172.16.' ||
                            details.address.substring(0, 5) === '10.0.'
                        ) {
                            ip = details.address;
                            ++alias;
                        }
                    }
                }
            });
        }
        return ip;
    }
    searchForDevices() {
        let browser = mdns.createBrowser(mdns.tcp('googlecast'));
        browser.on('ready', browser.discover);

        browser.on('update', service => {
            console.log('data:', service);
            console.log('found device "%s" at %s:%d', service.fullname.substring(0, service.fullname.indexOf("._googlecast")), service.addresses[0], service.port);
            this.ondeviceup(service.addresses[0], service.fullname.indexOf("._googlecast"));
            browser.stop();
        });
    }
    stream(host) {
        let client = new castv2Client();

        client.connect(host, () => {
            console.log('connected, launching app ...');

            client.launch(castv2DefaultMediaReceiver, (err, player) => {
                let media = {

                    // Here you can plug an URL to any mp4, webm, mp3 or jpg file with the proper contentType.
                    contentId: 'http://' + this.getIp() + ':' + this._server.address().port + '/',
                    contentType: 'audio/mp3',
                    streamType: 'BUFFERED', // or LIVE

                    // Title and cover displayed while buffering
                    metadata: {
                        type: 0,
                        metadataType: 0,
                        title: "Audio Caster",
                    }
                };

                player.on('status', status => {
                    console.log('status broadcast playerState=%s', status);
                });

                console.log('app "%s" launched, loading media %s ...', player, media);

                player.load(media, {
                    autoplay: true
                }, (err, status) => {
                    console.log('media loaded playerState=%s', status);
                });

            });

        });

        client.on('error', err => {
            console.log('Error: %s', err.message);
            client.close();
        });
    }
}


let instance = new App;
instance.searchForDevices();

export
default instance;