/* eslint class-methods-use-this: 0 */
/*
Aria2 client wrapper. Provide download APIs and maintain the download queue.
*/

import * as random from '../utils/random';

const EventEmitter = require( 'events' );
const { spawn } = require('child_process');
const path = require('path');
const fs = require('fs');
const Aria2 = require('aria2');
const { URL } = require('url');

export class Downloader extends EventEmitter {
  constructor(aria2) {
    super();
    this.aria2 = aria2;
    this.downloads = [];
    this.downloadOptions = {};
  }

  // return a Promise, with a Downloader instance.
  // retry a few times, just in case the port been occupied during starting aria2
  static init(retries = 5) {
    return new Promise((resolve, reject) => {
      this.tryInit()
        .then(downloader => resolve(downloader))
        .catch(err => (retries > 1 ? resolve(this.init(retries - 1)) : reject(err)));
    });
  }

  // return a Promise, with a Downloader instance.
  static tryInit() {
    return new Promise(async (resolve, reject) => {
      // use random port/secret to enhance security, and allow multiple instances
      // run simultaneously.
      const port = await random.getRandomPort();
      const secret = random.getRandomString(16);

      // prepare options for both Aria2 deamon and client.
      const options = {
        secure: false,
        host: 'localhost',
        port,
        secret,
        path: '/jsonrpc'
      };
      console.log(`Attempt to start Aria2 deamon at port ${port}`);

      // start aria2c
      const child = spawn('./aria2/aria2c', [
        '--conf-path', './aria2/aria2.conf',
        '--rpc-listen-port', options.port,
        '--rpc-secret', options.secret,
      ]);

      // simply log stdout/sterr outputs to console.
      child.stdout.setEncoding('utf8');
      child.stdout.on('data', data => { if (data.trim().length) console.debug(data); });
      child.stderr.setEncoding('utf8');
      child.stderr.on('data', err => { console.error(err); reject(err); });

      // handle errors
      child.on('error', err => { console.error(err); reject(err.message); });
      child.on('close', (code) => {
        const msg = `Aria2 deamon exited with code ${code}`;
        console.error(msg);
        reject(msg);
      });

      // wait some time to make sure aria2c started.
      setTimeout(() => {
        // create a aria2c client
        const aria2 = new Aria2(options);

        // test connection
        aria2.open()
          .then(() => aria2.getVersion())
          .then(res => {
            console.log(`Aria2 deamon started on port ${options.port}, secret: ${options.secret}`);
            console.log(`Aria2 version: ${res.version}`);
            return resolve(new Downloader(aria2));
          })
          .catch(err => {
            const msg = `Failed to get Aria2 version, err: ${err}`;
            console.error(msg);
            reject(msg);
          });
      }, 500);
    });
  }

  setFtpClient(ftpClient) {
    this.ftpClient = ftpClient;
  }

  getDownloads() {
    return this.downloads;
  }

  clearDownloads() {
    this.downloads = [];
  }

  setDownloadOptions(options) {
    this.downloadOptions = {
      ...this.downloadOptions,
      ...options
    };
  }
  getDownloadOptions() {
    return this.downloadOptions;
  }

  getFileName(item) {
    return item.files[0].path ?
      // extract from local file path if possible
      path.basename(item.files[0].path) :
      // otherwise extract from uri, however the final file name might
      // need renaming, so add a ? to indicate it's tentative.
      `?${path.basename(item.files[0].uris[0].uri)}`;
  }

  // fields used by tellStatus
  INTERESTED_KEYS = [
    'gid', 'status', 'totalLength', 'completedLength',
    'dir', 'downloadSpeed', 'files'
  ];

  // convert arai2 tellStatus download item to our format.
  convertItem(x) {
    return {
      gid: x.gid,
      status: x.status,
      name: this.getFileName(x),
      localDir: x.dir,
      size: parseInt(x.totalLength, 10),
      completedSize: parseInt(x.completedLength, 10),
      speed: x.status === 'active' ? parseInt(x.downloadSpeed, 10) : 0,
      url: x.files[0].uris[0].uri
    };
  }

  emitError(event, item, err) {
    console.warn(event, err);
    this.emit(event, {
      item,
      code: err.code,
      msg: err.message
    });
  }

  emitChange(event, item) {
    switch (event) {
      case 'item-added':
        this.downloads = [...this.downloads, item];
        break;
      case 'item-cancelled':
        this.downloads = this.downloads.filter(x => (x.gid !== item.gid));
        break;
      default:
        this.downloads = this.downloads.map(x => ((x.gid === item.gid) ? item : x));
        break;
    }
    this.emit(event, item);
    this.emit('change', this.downloads);
  }

  retryDownload(item, retry) {
    console.log(`download suggestion for ${item.name}: ${retry}`);
    const url11 = new URL(item.url);
    item.status = 'active';
    this.emitChange('item-updated', item);
    this.ftpClient.get(url11.pathname+url11.search, (err, socket) => {
      if(err) {
        console.log('eeeeeeeeeeeeeeeee',err);
        return;
      }
      const writeStream = fs.createWriteStream(item.localDir+'\\'+path.basename(item.url));
      writeStream.on("error", console.error);
      socket.on("data", d => {
        writeStream.write(d);
        //console.log(d);
      });
      socket.on("close", hadErr => {
        if(hadErr) {
          console.error("There was an error retrieving the file.");
          if(retry<3) {
            item.status = 'resume';
            item.retrytime = Date.now()+30000;
            item.retry = retry;
            this.emitChange('item-updated', item);
          }
        } else {
          writeStream.end();
          item.status = 'complete';
          item.retrytime = 0;
          item.retry = 0;
          item.completedSize = 100;
          this.emitChange('item-completed', item);
          console.log('File copied successfully!');
        }
      });
      socket.resume();
    });
  }

  addDownloads(uris, localDir) {
    let that = this;
    const options = {
      ...this.downloadOptions,
      dir: localDir
    };
    //console.log('downloadOptions:', options);
    uris.forEach(url => {
      if(options.split==1) {
        const url11 = new URL(url);
        let item = {
          gid: random.getRandomString(16),//Date.now().toString(),
          status: 'init',
          name: path.basename(url),
          localDir: options.dir,
          size: 100,
          completedSize: 0,
          speed: 10,
          url: url,
          retrytime: 0,
          retry: 0
        };
        this.emitChange('item-added', item);
        this.retryDownload(item, 0);return;
        this.ftpClient.get(url11.pathname+url11.search, localDir+'\\'+path.basename(url), err => {
          if(err) {
            // create a fake item
            const item = {
              gid: '',
              status: '',
              name: path.basename(url),
              localDir: options.dir,
              size: 0,
              completedSize: 0,
              speed: 0,
              url
            };
            console.log('There was an error retrieving the file',err);
            return this.emitError('item-add-failed', item, err);
          } else {
            console.log('File copied successfully!');
            let item = {
              gid: Date.now().toString(),
              status: 'active',
              name: path.basename(url),
              localDir: options.dir,
              size: 100,
              completedSize: 100,
              speed: 10,
              url: url
            };
            this.emitChange('item-added', item);
            item.status = 'complete';
            return this.emitChange('item-completed', item);
          }
        });
      } else {
        const url11 = url;
        this.aria2.addUri([url11], options)
          .then(gid => this.aria2.tellStatus(gid, this.INTERESTED_KEYS))
          .then(res => {
            const item = this.convertItem(res);
            return this.emitChange('item-added', item);
          })
          .catch(err => {
            // create a fake item
            const item = {
              gid: '',
              status: '',
              name: path.basename(url11),
              localDir: options.dir,
              size: 0,
              completedSize: 0,
              speed: 0,
              url11
            };
            this.emitError('item-add-failed', item, err);
          });
      }
    });
  }

  addDownload(url, localDir) {
    const url11 = new URL(url);
    let item = {
      gid: random.getRandomString(16),//Date.now().toString(),
      status: 'init',
      name: path.basename(url),
      localDir: localDir,
      size: 100,
      completedSize: 0,
      speed: 10,
      url: url,
      retrytime: 0,
      retry: 0
    };
    this.emitChange('item-added', item);
    this.retryDownload(item, 0);
    return item.gid;
  }

  refresh() {
    if(this.downloadOptions.split==1) {
      this.downloads.forEach(item => {
        //console.log(item.retrytime,Date.now());
        if(item.status=='resume'&&item.retrytime<=Date.now()) {
          this.retryDownload(item, item.retry++);
        }
      });
    } else {
      this.downloads.forEach(item => {
        this.aria2.tellStatus(item.gid, this.INTERESTED_KEYS)
          .then(res => {
            const newItem = this.convertItem(res);
            // if status changed to 'complete'
            if ((newItem.status !== item.status) && (newItem.status === 'complete')) {
              this.emitChange('item-completed', newItem);
            }
            return this.emitChange('item-updated', newItem);
          })
          .catch(err => this.emitError('item-update-failed', item, err));
      });
    }
  }

  getControlFile = file => (`${file}.aria2`);

  isDownloading = x => (x.status === 'active' || x.status === 'waiting' || x.status === 'paused' || x.status === 'error');

  canPause = x => (x.status === 'active' || x.status === 'waiting');
  canPauseAll = () => this.downloads.some(x => this.canPause(x));
  canResume = x => (x.status === 'paused' || x.status === 'error');
  canResumeAll = () => this.downloads.some(x => this.canResume(x));
  canCancel = this.isDownloading;   // alias
  canCancelAll = () => this.downloads.some(x => this.canCancel(x));

  pause(item) {
    this.aria2.pause(item.gid)
      .then(() => {
        const x = { ...item, status: 'paused' };
        return this.emitChange('item-paused', x);
      })
      .catch(err => this.emitError('item-pause-failed', item, err));
  }
  pauseAll = () => this.downloads.filter(this.canPause).forEach(this.pause.bind(this));

  resume(item) {
    if(item.status === 'error') {
      /*const options = {
        ...this.downloadOptions,
        dir: localDir,
      };
      this.aria2.addUri([url], options)
        .then(gid => this.aria2.tellStatus(gid, this.INTERESTED_KEYS))
        .then(res => {
          const item = this.convertItem(res);
          return this.emitChange('item-added', item);
        })
        .catch(err => {
          // create a fake item
          const item = {
            gid: '',
            status: '',
            name: path.basename(url),
            localDir: options.dir,
            size: 0,
            completedSize: 0,
            speed: 0,
            url
          };
          this.emitError('item-add-failed', item, err);
        });*/
      //const x = { ...item, status: 'active' };
      //return this.emitChange('item-updated', x);
    } else {
      this.aria2.unpause(item.gid)
        .then(() => {
          const x = { ...item, status: 'waiting' };
          return this.emitChange('item-resumed', x);
        })
      .catch(err => this.emitError('item-resume-failed', item, err));
    }
  }
  resumeAll = () => this.downloads.filter(this.canResume).forEach(this.resume.bind(this));

  cancel(item) {
    if(item.status === 'error') {
      //this.aria2.forceRemove(item.gid)
      //  .then(() => {
          const x = { ...item, status: 'removed' };
          this.emitChange('item-cancelled', x);
      //  })
      //  .catch(err => this.emitError('item-cancel-failed', item, err));
    } else {
      this.aria2.forceRemove(item.gid)
        .then(() => {
          // Will emit 2 events.
          //  First 'item-removed', means it's removed from the download queue.
          //  Seconds 'item-cancelled', means the cleanup job done.
          const x = { ...item, status: 'removed' };
          this.emitChange('item-removed', x);

          // delay the control file deleting a few seconds to avoid sharing violation.
          return setTimeout(() => {
            // remove local files
            try {
              fs.unlinkSync(path.join(item.localDir, item.name));
              fs.unlinkSync(path.join(item.localDir, this.getControlFile(item.name)));
            } catch (err) {
              // ignore
            }

            this.emitChange('item-cancelled', x);
          }, 500);
        })
        .catch(err => this.emitError('item-cancel-failed', item, err));
      }
  }
  cancelAll = () => this.downloads.filter(this.canCancel).forEach(this.cancel.bind(this));
}
