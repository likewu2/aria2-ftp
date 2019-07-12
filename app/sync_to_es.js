const Util = require('util');
const FS = require('fs');
const Path = require('path');
//const PG = require('pg');
const Async = require('async');
const snappy = require('snappy')
const elasticsearch = require('elasticsearch');

let mService = {
  Database: null,
  Logdir: 'E:/app/syslog111',
  Outdir: 'E:/app/syslog111',
  Config: null
};
//mService.Config = require('./config10.json');

let synclog;
try {
  synclog = FS.readFileSync(mService.Outdir+'/synceslog.txt', {});
} catch(err) {}
let synclogarr;
if(synclog) {
  //console.log(synclog);
  synclogarr = JSON.parse(synclog);
} else {
  synclogarr = {0:'',1:'',2:''};
}
//process.exit();

//StartDatabase();
//await mService.Database.query("SELECT MAX(rate_date) rate_date FROM public.xrp_exchange_rates where base='"+base+"' and baseissuer='"+baseissuer+"';", []);

let esclient = new elasticsearch.Client({
  host: 'localhost:9200',
  log: 'info',
  apiVersion: '6.5'
});

let testcount = 0;
console.log('starting list log dir');
ListLogdir(mService.Logdir);


function startDatabase(callback) {
  let url = Util.format("postgresql://%s:%s@%s:%d/%s",
    mService.Config.Database.User,
    mService.Config.Database.Password,
    mService.Config.Database.Host,
    mService.Config.Database.Port,
    mService.Config.Database.DB);
  console.log("Connect: " + url);
  let pgclient = new PG.Client({
      connectionString: url,
  });
  pgclient.connect();

  mService.Database = pgclient;
  console.log('Connect to database sucess!!!');
  callback();
}

async function ListLogdir(dir, depth=0) {
  if(dir>'E:/app/syslog111/2018/12/21/17') return;
  let dirents = FS.readdirSync(dir, {withFileTypes:true})
  for(let K in dirents){
    if(dirents[K].isDirectory()) {
      let curdir = dir+'/'+dirents[K].name;
      if(depth==0&&curdir<mService.Logdir+synclogarr['0']) continue;
      if(depth==1&&curdir<mService.Logdir+synclogarr['1']) continue;
      if(depth==2&&curdir<=mService.Logdir+synclogarr['2']) continue;
      console.log('dir: ', depth, curdir, synclogarr);
      await ListLogdir(curdir, depth+1);
      //console.log(depth, curdir);
      if(depth==2) {
        let lastdir = curdir.substring(curdir.indexOf(mService.Logdir)+mService.Logdir.length);
        let lastdirarr = lastdir.split('/');
        synclogarr[0] = lastdirarr.slice(0,2).join('/');
        synclogarr[1] = lastdirarr.slice(0,3).join('/');
        synclogarr[2] = lastdirarr.slice(0,4).join('/');
        FS.writeFileSync(mService.Outdir+'/synceslog.txt', JSON.stringify(synclogarr));
      }
    } else if(dirents[K].isFile()&&Path.extname(dirents[K].name)=='.snappy') {
      testcount++;
      console.log('file: ', dir+'/'+dirents[K].name);
      //let idname = Path.basename(dirents[K].name, '.snappy');
      let idname = dir.substring(dir.length-13).replace(/\//g,'')+dirents[K].name.substring(0,2);
      let content = snappy.uncompressSync(FS.readFileSync(dir+'/'+dirents[K].name), {asBuffer:false});
      let logarr = content.split("\n");
      if(logarr[logarr.length-1]=='') logarr.splice(logarr.length-1,1);
      for(let I in logarr) {
        //if(dir=='E:/app/syslog111/2018/12/21/16')
        //  console.log(logarr[I]);
        let log = JSON.parse(logarr[I]);
        const resp = await esclient.index({
          index: log['__topic__']+'_idx', type: 'fulltext', id: idname+'_'+I,
          body: { title: log['__time__'], content: log['__raw__'], source:log['__source__'] }
        });
        //console.log(resp);
        //await client.delete({ index: log['__topic__']+'_idx', type: 'fulltext', id: idname+'_'+I });
        /*esclient.bulk({
          body: [
            { index:  { _index: log['__topic__']+'_idx', _type: 'fulltext', _id: log['__time__'] } },
            { title: log['__time__'], content: log['__raw__'], source:log['__source__'] },
            //{ update: { _index: 'pvindex', _type: 'fulltext', _id: 2 } },
            //{ doc: { title: 'foo' } },
            //{ delete: { _index: 'pvindex', _type: 'fulltext', _id: 3 } },
          ]
        }, function (err, resp) {
          console.log(err,resp);
        });*/
      }
    } else {
      console.log('err file: ', dir+'/'+dirents[K].name);
    }
  }
}