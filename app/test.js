const Jsftp = require('jsftp');
const { URL } = require('url');

let address = `ftp://LTAIwZxpYzrE87X5%2Fsyslog111:0V7y63bKWD0cp9NU9XTfO7QL8c5ZYU@127.0.0.1:2048`;
let url = new URL(address);
//console.log(url);

const connect = url => {
  const p = new URL(url);
  console.log('ftp url:', p);
  return new Promise((resolve, reject) => {
    const ftpClient = new Jsftp({
      host: p.hostname,
      port: p.port || 21,
      user: decodeURIComponent(p.username) || 'anonymous',
      pass: p.password || '@anonymous',
    });

    ftpClient.on('connect', () => {
      // get Feature List after connection established,
      // since we prefer to use MLSD so need to know whether it's supported.
      ftpClient.getFeatures((err) => {
        if (err) {
          reject(err.message);
        } else {
          resolve(ftpClient);
        }
      });
    });

    ftpClient.on('error', err => {
      console.error(err);
      reject(err.message);
    });
  });
};

const joinURL = (p1, p2) => {
  if (p1[p1.length - 1] === '/') p1 = p1.slice(0, p1.length - 1);
  if (p2[0] === '/') p2 = p2.slice(1);
  return (`${p1}/${p2}`);
};

const readDirMLSD = (ftpClient, dir) => new Promise((resolve, reject) => {
  console.log('Using MLSD');
  ftpClient.raw('CWD', dir, error => {
    if (error) {
      console.warn(error);
      return reject(error.message);
    }

    ftpClient.mlsd('', (error2, items) => {
      if (error2) {
        console.warn(error2);
        return reject(error2.message);
      }
      return resolveItems(resolve, dir, items, 0);
    });
  });
});

const readDirLS = (ftpClient, dir) => new Promise((resolve, reject) => {
  console.log('Using LS');
  ftpClient.ls(dir, (error, items) => {
    if (error) {
      console.warn(error);
      return reject(error.message);
    }

    // check FTP server time differnce if needed
    if (   (!ftpClient.hasFeat('mdtm'))  // doesn't support MDTM.
        || (ftpClient.timeDiff !== undefined)  // got result already.
        || (!items.length)    // empty folder, no file to send MDTM.
    ) {
      return resolveItems(resolve, dir, items, ftpClient.timeDiff || 0);
    }

    // send MDTM command for one file to get the time differnce.
    const p = joinURL(dir, items[0].name);
    console.log(`Got file list, check server timezone via MDTM ${p}`);

    ftpClient.raw('MDTM', p, (err, data) => {
      let diff = 0;
      if (err || data.isError) {
        console.log('MDTM error, simply ignore.');
      } else {
        diff = calculateTimeDifference(items[0], data);
      }

      // store the timeDiff, we only need to do it once per connection.
      ftpClient.timeDiff = diff;
      return resolveItems(resolve, dir, items, diff);
    });
  });
});

const readDir = (ftpClient, inputDir) => {
  const dir = inputDir || '/';

  console.log(`Begin loading FTP folder: ${dir}`);
  const func = ftpClient.hasFeat('mlsd') ? readDirMLSD : readDirLS;
  return func(ftpClient, dir);
};

let aa = connect(address)
      .then((ftpClient) => {
        // ${data} doesn't contain pathname
        readDir(ftpClient, '/nginxlog54');
        console.log('aaaaa');
      })
      .catch((err) => {
        const msg = `Sorry, '${address}' cannot be accessed.`;
        console.log(msg);
      });
