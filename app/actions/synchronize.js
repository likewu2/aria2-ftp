import { getDownloadSuggestions } from '../actions/app';
import { joinURL } from '../utils/ftpUrl';
import * as apputils from '../utils/apputils';
import notifications from '../utils/notifications';
import { actions } from 'react-redux-form';
import * as types from '../constants/ActionTypes';
import * as api from '../api/ftp';
import { TYPE_FOLDER } from '../utils/fileType';
import { loadLocalDir } from '../actions/localDir';

const FS = require('fs');
const Path = require('path');
const app = require('electron').remote.app;

let Logdir;
const RemoteDir = '/nginxlog54';
let synclogarr;
let testcount = 0;

export const SynchronizeDir = (toLocalDir) =>  async (dispatch, getState) => {
  const { ftp, downloader, settings } = getState();

  if(!(ftp.ftpClient&&ftp.ftpClient.socket)) {
    notifications.warn(`ftp is disconnected.`);
    return;
  }

  let synclog;
  try {
    synclog = FS.readFileSync(toLocalDir+'/synclog.txt', {});
  } catch(err) {}
  if(synclog) {
    //console.log(synclog);
    synclogarr = JSON.parse(synclog);
  } else {
    synclogarr = {0:'',1:'',2:''};
  }

  console.log('synchronizeDir, local dir:', toLocalDir);
  downloader.setFtpClient(ftp.ftpClient);

  Logdir = toLocalDir;
  await ListLogdir(RemoteDir, toLocalDir, 0, ftp, dispatch, downloader);
};

async function ListLogdir(fromRemoteDir, toLocalDir, depth=0, ftp, dispatch, downloader) {
  //if(toLocalDir>'E:\\app\\syslog111\\2018\\12\\21\\17') return;
  try {
    let { dir, items } = await api.readDir(ftp.ftpClient, fromRemoteDir);
    dispatch(actions.change('ftpDirForm.dir', dir));
    dispatch(ftpDirLoadSuccess(dir, items));
    if(!FS.existsSync(toLocalDir)) {
      FS.mkdirSync(toLocalDir);
    }
    dispatch(notifyDirChange(toLocalDir));
    let suggestionMap
    if(depth==4) {
      const ftpItems = dispatch(getDownloadSuggestions());
      suggestionMap = ftpItems.reduce((map, obj) => ({ ...map, [obj.name]: obj.suggestion }), {});
    }
    for(let K in items) {
      //console.log(items[K]);continue;
      if(items[K].type===TYPE_FOLDER) {
        let curdir = fromRemoteDir+'/'+items[K].name;
        if(depth==0&&curdir<RemoteDir+synclogarr['0']) continue;
        if(depth==1&&curdir<RemoteDir+synclogarr['1']) continue;
        if(depth==2&&curdir<=RemoteDir+synclogarr['2']) continue;
        console.log('fromRemoteDir: ', depth, curdir, toLocalDir+Path.sep+items[K].name, synclogarr);
        await ListLogdir(curdir, toLocalDir+Path.sep+items[K].name, depth+1, ftp, dispatch, downloader);
        //console.log(depth, curdir);
        if(depth==2) {
          let lastdir = curdir.substring(curdir.indexOf(RemoteDir)+RemoteDir.length);
          let lastdirarr = lastdir.split('/');
          synclogarr[0] = lastdirarr.slice(0,2).join('/');
          synclogarr[1] = lastdirarr.slice(0,3).join('/');
          synclogarr[2] = lastdirarr.slice(0,4).join('/');
          FS.writeFileSync(Logdir+'/synclog.txt', JSON.stringify(synclogarr));
        }
      } else if(Path.extname(items[K].name)=='.snappy') {
        testcount++;
        console.log('file: ', dir+'/'+items[K].name);
        const suggestion = suggestionMap[items[K].name];
        const urlBase = joinURL(ftp.address, dir);
        const url = joinURL(urlBase, items[K].name);
        if (suggestion === 'downloading') {
          notifications.warn(`${items[K].name} is in download queue already.`);
        } else {
        }

        let gid;
        while(true) {
          if(gid) {
            let item = downloader.getDownloads().filter(x => (x.gid === gid))[0];
            if(item.status=='resume'/*&&item.retrytime<=Date.now()*/) {
              downloader.retryDownload(item, item.retry++);
            } else if(item.status=='complete') {
              break;
            } else if(!item) {
              console.log('error is null');
            }
          } else {
            gid = downloader.addDownload(url, toLocalDir);
          }
          await apputils.sleep(20000);
        }
      } else {
        console.log('err file: ', dir+'/'+items[K].name);
      }
    }
    if(depth==4) {
      downloader.clearDownloads();
      //await apputils.sleep(500);
    }
  } catch(err) {
    console.log(err);
    const msg = `Sorry, '${fromRemoteDir}' does not exist. Going back to root.`;
    dispatch(ftpDirLoadFailure(msg));
    notifications.warn(msg);

    // go back to root
    //await api.readDir(ftp.ftpClient, '/');
  }
}

const ftpDirLoadSuccess = (dir, items) => ({
  type: types.FTP_DIR_LOAD_SUCCESS,
  dir,
  items
});

const ftpDirLoadFailure = errorMsg => ({
  type: types.FTP_DIR_LOAD_FAILURE,
  errorMsg
});

const updateDownloadQueue = items => ({
  type: types.UPDATE_DOWNLOAD_QUEUE,
  items
});

const notifyDirChange = dir => (dispatch) => {
  dispatch(loadLocalDir(dir));
};