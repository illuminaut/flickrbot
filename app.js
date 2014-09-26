var debug = require('debug')('flickrbot');
var express = require('express');
var debug;

var path = require('path');
var favicon = require('serve-favicon');
var logger = require('morgan');
var cookieParser = require('cookie-parser');
var bodyParser = require('body-parser');
var partials = require('express-partials');

var routes = require('./routes/index');
var users = require('./routes/users');
var Primus = require('primus');
var dbprovider = require('./dbprovider').dbprovider;
var flickrprovider = require('./flickrprovider');//.flickrprovider;
async = require('async');
var util = require('util');

var app = express();
var db = new dbprovider();
var flickr = new flickrprovider();

// view engine setup
app.set('views', path.join(__dirname, 'views'));
app.set('view engine', 'ejs');
app.use(partials());
// uncomment after placing your favicon in /public
//app.use(favicon(__dirname + '/public/favicon.ico'));
app.use(logger('dev'));
app.use(bodyParser.json());
app.use(bodyParser.urlencoded({ extended: false }));
app.use(cookieParser());
app.use(express.static(path.join(__dirname, 'public')));

app.use('/', routes);
app.use('/users', users);
app.get('/log', function(req,res) { res.render('log', { title: 'flickrbot', activelink: 'activitylog'}); });
app.get('/contacts', function(req,res) { res.render('contacts', { title: 'flickrbot', activelink: 'contacts' }); });
app.get('/favorites', function(req,res) { res.render('favorites', {title: 'flickrbot', activelink: 'favorites'}); });
app.get('/table/:table', gettable );
app.get('/favorites/remove', removefave );
app.get('/favorites/setvip', setvip);

// catch 404 and forward to error handler
app.use(function(req, res, next) {
    var err = new Error('Not Found');
    err.status = 404;
    next(err);
});

//var primus = new Primus(server, { transformer: 'engine.io' });

// error handlers

// development error handler
// will print stacktrace
if (app.get('env') === 'development') {
    debug = true;
    app.use(function(err, req, res, next) {
        res.status(err.status || 500);
        res.render('error', {
            message: err.message,
            error: err
        });
    });
}

// production error handler
// no stacktraces leaked to user
app.use(function(err, req, res, next) {
    res.status(err.status || 500);
    res.render('error', {
        message: err.message,
        error: {}
    });
});



app.set('port', process.env.PORT || 3000);

var server = require('http').createServer(app)
, primus = new Primus(server, { transformer: 'engine.io' });

server.listen(app.get('port'));
console.log ('listening on port '+app.get('port'));

// set the timer to do housekeeping
var timeout = setInterval(runupdates, 3600000);

var logerror = function(error) {
    if (error.type === 'error') {
        console.error(error.data);
    } else if (error.type === 'warn') {
        console.warn(error.data);
    } else {
        console.log(error);
    }
    if (error.spark) {
        error.spark.write({type:error.type,data:error.data});
    }
}

// realtime socket routing

primus.on('connection', function (spark) {
  //console.log('connection has the following headers', spark.headers);
  console.log('connection was made from', spark.address);
  console.log('connection id', spark.id);

  spark.on('data', function (data) {
    //console.log('received data from the client', data);
    switch (data.message) {
        case "contacts":
            refreshcontacts(spark);
            break;
        case "favorites":
            refreshfaves(spark);
            break;
        case "updatelastactivity":
            updatelastactivity(spark);
            break;
        case "getactivity":
            importActivity(spark);
            break;
        case "cleanupfaves":
            cleanupfaves(data,spark);
            break;
        case "addfaves":
            addfaves(data,spark);
            break;
        case "gettable":
            gettable(data,spark);
            break;
        case "syncfaves":
            syncfaves(spark);
            break;
        case "synccontacts":
            synccontacts(spark);
            break;
        default:
            console.log('received unrecognized command from client: ',data);
    }
  });

  spark.write('Connected');
});

function refreshcontacts(spark) {
  dbprovider.getContacts(function(error, results) {
    if (error) { logerror({type:'error',data:error,spark:spark}); }
    else {
      //spark.write({type: 'message', data: 'Fetched results: '+results.length});
      util.debug('Fetched results: '+results.length);
      for (var i=0; i<results.length; i++) {
        spark.write({type:'contact', data:results[i]});
      }
    }
  },18);
  dbprovider.getContactCounts(function(error, results) {
    if (error) { logerror({type:'error',data:error,spark:spark}); }
    else {
      spark.write({type:'update', data:results[0]});
    }
  });
  dbprovider.getLastActivity(function(error,results) {
    if (error) { logerror({type:'error',data:error,spark:spark}); }
    else {
      if (results[0]) {
        spark.write({type:'update', field: '', data: {lastsynccontacts:results[0].timestamp}});
      }
    }
  },'sync_contacts');
}

function refreshfaves(spark){
  //spark.write({type:'message', data: 'Fetching favorites...'});
  dbprovider.getFaves(function(error,results) {
    if (error) {
      logerror({type:'error',data:error,spark:spark});
    } else {
      //spark.write({type:'message', data: 'Fetched results: '+results.length});
      for (var i=0; i< results.length; i++) {
        spark.write({type:'fave', data:results[i]});
      }
      dbprovider.getFavesCounts(function(error,results) {
        if (error) {
          logerror({type:'error',data:error,spark:spark});
        } else {
          spark.write({type:'update', data:results[0]});
          //spark.write({type:'message', data: 'Faves counts: '+results[0].totalfaves + ' (' + results[0].protectedfaves + ')'});
          util.debug('Faves counts: '+results[0].totalfaves + ' (' + results[0].protectedfaves + ')');
        }
      });
      dbprovider.getLastActivity(function(error,results) {
        if (error) { logerror({type:'error',data:error,spark:spark}); }
        else {
          if (results[0]) {
            spark.write({type:'update', field: '', data: {lastsyncfaves:results[0].timestamp}});
          }
        }
      },'sync_faves');
    }
  },10);
}

function updatelastactivity(spark) {
  if (!spark) {
    spark = primus;
  }
  dbprovider.getLastActivity(function(error,results) {
    if (error) { logerror({type:'error',data:error,spark:spark}); }
    else {
      if (results[0]) {
        spark.write({type:'update', data:{lastcleanupfaves: results[0].timestamp}});
      }
    }
  },'cleanup_faves');
  dbprovider.getLastActivity(function(error,results) {
    if (error) { logerror({type:'error',data:error,spark:spark}); }
    else {
      if (results[0]) {
        spark.write({type: 'update', data:{lastactivitycheck: results[0].timestamp}});
      }
    }
  },'get_activity');
  dbprovider.getLastActivity(function(error,results) {
    if (error) { logerror({type:'error',data:error,spark:spark}); }
    else {
      if (results[0]) {
        spark.write({type:'update', data:{lastaddfaves: results[0].timestamp}});
      }
    }
  },'add_faves');    
}

function importActivity(spark,finished) {
  var activity;
  if (typeof finished === 'undefined') {
    finished = function(res) {
        // dummy function if no callback supplied
    }
  }
  dbprovider.getLastActivity(function(error,results){
    if (error) {
      logerror({type:'error',data:error,spark:spark});
      finished(error);
    } else {
      var lastimport = 0, now = new Date();
      if (results.length) {
        lastimport = new Date(results[0].unixtime * 1000);
      }
      //console.log(JSON.stringify(results, null, 4));
      //console.log('last imported: '+lastimport.toString()+' Now: '+now.toString()+' Diff: '+(Math.floor((now-lastimport)/60000))+' minutes');
      if ((now-lastimport) / 1000 < 3600) {
        var err = 'getLastActivity can only be called once per hour. Last called: '+(Math.floor((now-lastimport)/60000))+' minutes ago ('+lastimport.toString()+')';
        logerror({type:'error',spark:spark,data:err});
        finished(err);
      } else {
        var page = 1;
        var fArray = [];
        var importActivity = function (items) {
          dbprovider.importActivity(function(error,results) {
            if (error) {
                logerror({type:'error',data:error,spark:spark});
                finished(error);
            }
            else {
              console.log('done importing activity. imported '+results+' events');
              //updatelastactivity(spark);
              dbprovider.updateActivity(function(error,res){
                if (error) {
                  logerror({type:'error',data:error,spark:spark});
                  finished(error);
                } else {
                  
                  if (results > 0) {
                    dbprovider.updateVipStatus(function(error,res) {
                      if (error) {
                        logerror({type:'error',data:error,spark:spark});
                        //finished(error);
                      } else {
                        var msg = 'updated vip status of ' + res + ' faves';
                        console.log(msg);
                        //finished('Ok: '+msg);
                        
                      }
                    });
                  }
                  updatelastactivity(spark);
                  finished('Ok. Imported '+results+' events');
                }
              },{action: 'get_activity', num_affected: results, message: 'added '+results+' activity items'});
            }
          },items);
          
        }
        flickrprovider.getActivity(function(error,results) {
          if (error) {
            logerror({type:'error',data:error,spark:spark});
          } else {
            console.log('fetching page ' + results.items.page + ' of ' + results.items.pages);
            activity = results;
            var remainingPages = results.items.pages - results.items.page;
            if (remainingPages > 0) {
              var callPage = function(id, callback) {
                console.log('fetching page '+page);
                flickrprovider.getActivity(function(error,results) {
                  if (error) {
                    logerror({type:'error',data:error,spark:spark});
                    callback(error,results);
                  } else {
                    callback(null,results);
                  }
                },id);
              };
              
              async.timesSeries(remainingPages, function(n, next){
                  callPage(n+2, function(err, page) {
                    next(err, page)
                  })
              }, function(err, pages) {
                // we should now have all pages
                for (var i=0;i<pages.length;i++) {
                  fArray = fArray.concat(pages[i].items);
                }
                importActivity(fArray);
              });
            } else {
              importActivity(activity.items);
            }
          }
        }, page);
      }
    }
  },'get_activity');
}

function cleanupfaves(data,spark,finished) {
  var maxfaves = data.maxfaves || 300;
  var addedvip = 0, removed = 0, num = 0, total = 0;
  var minage = data.minage || 7; // only start removing favorites after a minimum number of days
  if (typeof finished === 'undefined') {
    finished = function (dummy) {}
  }
  console.log('cleaning up ' + maxfaves + ' faves...');
  dbprovider.getNoVipFaves(function(error,results) {
    if (error) {
      logerror({type:'error',data:error,spark:spark});
      finished(error);
    } else {
      total = results.length;
      spark.write({type:'progress', data: {status: 'start', total: total, id: 'cleanup'}});
      if (debug) {//console.log(JSON.stringify(results))};
        util.debug('processing '+results.length+' results without VIP status');
      }
      async.eachLimit(results,5,function(fave,callback) {
        //iterator
        flickrprovider.getContactInfo(function(err,res) {
          num++;
          spark.write({type:'progress', data: {status: 'update', value: num, total: total, id: 'cleanup'}});
          if (err) {
            logerror({type:'error',data:err,spark:spark});
            callback();
          } else {
            if (res.revcontact || res.revfamily || res.revfriend) {
              dbprovider.setFaveVIP(function(err3,res3) {
                if (err3) {
                  logerror({type:'error',data:err3,spark:spark});
                  callback();
                } else {
                  if (debug) {
                    util.debug('setting VIP status for photo ID '+fave.photo.ID+': '+res3);
                  }
                  addedvip++;
                  callback(null);
                }
              },fave.photoID);  
            } else {
              // not a reverse contact
              flickrprovider.removefave(function(err4,res4) {
                if (err4) {
                  //logerror(err4);
                  callback();
                } else {
                  /*if (debug) {
                    console.log('removed photo '+fave.photoID+' from flickr (Status: '+JSON.stringify(res4)+'). Removing from db...');
                  }*/
                  
                  dbprovider.deletefave(function(err5,res5) {
                    if (err5) {
                      //logerror(err5);
                      callback();
                    } else {
                      removed++;
                      callback(null);
                    }
                  },fave.photoID);
                }
              },fave.photoID);
            }
          }
        },fave.ownerID);
      }, function(err2) {
        //completed
        if (err2) {
          logerror({type:'error',data:err2,spark:spark});
          finished(err2);
        } else {
          if (debug) {
            util.debug('...finished getContactInfo');
          }
          spark.write({type:'progress', data: {status: 'finished', value: num, total: total, id: 'cleanup'}});
          dbprovider.updateActivity(function(error,results) {
            if (error) { logerror(error); finished(error); }
            else {
              dbprovider.getLastActivity(function(error2,results2) {
                if (error2) { logerror(error2); finished(error2); }
                else {
                  if (results2[0]) {
                    spark.write({type:'update', data:{lastcleanupfaves: results2[0].timestamp}});
                  }
                  finished('Cleaned up '+maxfaves+' favorites (removed: '+removed+', updated VIP: '+addedvip+')');
                }
              },'cleanup_faves');
            }
          },{action: 'cleanup_faves', num_affected: maxfaves, message: 'Cleaned up '+maxfaves+' favorites (removed: '+removed+', updated VIP: '+addedvip+')' });
        }
      });
    }
  },maxfaves,minage);
}

function addfaves(data,spark,finished){
    /*if (!spark) {
        spark = primus;
    }*/
    if (typeof finished === 'undefined') {
        finished = function (dummy) {}
    }
    var group = data.group, maxfaves = data.maxfaves || 100, userlimit = data.userlimit || 1, skipped=0, num=0, total=0;
    if (debug) { util.debug('adding '+maxfaves+' faves from group '+group)};
    flickrprovider.favegroup(function(error,fres) {
      if (error) { logerror({type:'error',data:error,spark:spark}); }
      else {
        photos = fres.photos.photo;
        total = fres.photos.photo.length;
        spark.write({type:'progress', data: {status: 'start', total: total, id: 'addfaves'}});
        async.eachLimit(photos,5,function(photo,callback) {
          num++;
          flickrprovider.addfave(function(error, res) {
            spark.write({type:'progress', data: {status: 'update', value: num, total: total, id: 'addfaves'}});
            if (error) {
              logerror('Skipping photo ' + photo.id + ': ' + error.toString());
              skipped++;
              callback(null);
            } else {
              dbprovider.addFave(function(error,res) {
                if (error) {
                  logerror({type:'error',data:'Error adding favorite '+photo.id + ' to DB: '+error.toString(),spark:spark});
                  callback(error)
                } else {
                  callback(null);
                }
              },photo);
            }
          },photo);
        },function(err) {
          //done inserting into db
          var numinserted = photos.length - skipped;
          dbprovider.updateActivity(function(error,results) {
            if (error) {
                logerror({type:'error',data:error,spark:spark});
                finished(error);
            }
            else {
              dbprovider.getLastActivity(function(error,results) {
                if (error) {
                    logerror({type:'error',data:error,spark:spark});
                    finished(error);
                }
                else {
                  //console.log(JSON.stringify(results[0]));
                  if (results[0]) {
                    spark.write({type:'progress', data: {status: 'finished', value: num, total: total, id: 'addfaves'}});
                    spark.write({type:'update', data:{lastaddfaves: results[0].timestamp}});
                    spark.write({type:'clear', data:'favesthumbs'});
                    refreshfaves(spark);
                    if (debug) {
                      util.debug('done.');
                    }
                    finished('added '+num+' faves');
                  }
                }
              },'add_faves');
            }
          },{action: 'add_faves', num_affected: numinserted, message: 'added '+numinserted+' faves from Group '+group});
        });
      }
    },group,maxfaves);    
}

function syncfaves(spark,finished) {
  if (!spark) { // if we didn't pass a specific connection, assume it's initiated by server and broadcast to everybody.
    spark = primus;
  }
  var page=1,fArray=[],i=0,deleted=0;
  /*if (typeof spark === undefined) { // if we didn't pass a specific connection, assume it's initiated by server and broadcast to everybody.
    spark = primus;
  }*/
  var compareresults = function(flickrlist) {
    console.log('comparing results: '+flickrlist.length);
    // importFaves both adds new Faves and removes those not in flickrlist
    dbprovider.importFaves(function(error, results) {
      if (error) {
        logerror({type:'error',data:error,spark:spark});
        if (typeof finished !== 'undefined') {
          finished(error);
        }
      }
      else {
        console.log('updated db. Now have ' + results.length + ' faves');
        spark.write({type:'progress', data: {status: 'finished', value: results.length, total: results.length, id: 'faves'}});
        dbprovider.getLastActivity(function(error,results) {
          if (error) {
            logerror({type:'error',data:error,spark:spark});
            if (typeof finished !== 'undefined') {
              finished(error);
            }
          }
          else {
            if (results[0]) {
              spark.write({type:'update', data:{lastsyncfaves: results[0].timestamp}});
              if (typeof finished !== 'undefined') {
                finished('Ok. Completed at '+results[0].timestamp);
              }
            }
          }
        },'sync_faves');
      }
    },flickrlist);    
  }
  flickrprovider.getfaves(function(error,results) {
    if (error) { logerror(error); }
    else {
      console.log('fetching page ' + results.photos.page + ' of ' + results.photos.pages);
      spark.write({type:'progress', data: {status: 'start', total: results.photos.total, id: 'faves'}});
      spark.write({type:'progress', data: {status: 'update', value: (results.photos.perpage * (results.photos.page-1)+results.photos.photo.length), total: results.photos.total, id: 'faves'}});
      var remainingPages = results.photos.pages - results.photos.page;
      if (remainingPages > 0) {
        //need to continue polling the API for all pages, lets use async
        //array to iterate over the array of remaining page numbers
        var callPage = function(id, callback) {
          console.log('fetching page '+id);
          flickrprovider.getfaves(function(error,results) {
            if (error) {
              logerror({type:'error',data:error,spark:spark});
              callback(error,results);
            } else {
              spark.write({type:'progress', data: {status: 'update', value: (results.photos.perpage * (results.photos.page-1)+results.photos.photo.length), total: (results.photos.total), id: 'faves'}});
              callback(null,results);
            }
          },id);
        }
        
        async.timesSeries(remainingPages, function(n, next){
            callPage(n+2, function(err, page) {
              next(err, page);
            })
        }, function(err, pages) {
          // we should now have all pages
          fArray = results.photos.photo;
          for (var i=0;i<pages.length;i++) {
            fArray = fArray.concat(pages[i].photos.photo);
          }
          compareresults(fArray);
        });
      } else { // just one page of results
        compareresults(results.photos.photo);
      }
    }
  },page);      
}

function synccontacts(spark,finished) {
  var page=1,fArray=[],updatemutual=0,deleted=0,inserted=0,num=0,total=0;
  if (!spark) { // if we didn't pass a specific connection, assume it's initiated by server and broadcast to everybody.
    spark = primus;
  }
  var compareresults = function(flickrlist) {
    console.log('results: '+flickrlist.length);
    // first, insert all new records to db
    dbprovider.importContacts(function(error1, results) {
      if (error1) { logerror(error1); }
      else {
        total = results.length;
        console.log('updated db. Now have ' + total + ' contacts');        
        spark.write({type:'progress', data: {status: 'start', total: total, id: 'contacts'}});
        async.each(results, function(contact,callback) {
          
          flickrprovider.getContactInfo(function(error2,flickrresults) {
            num++;
            spark.write({type:'progress', data: {status: 'update', value: num, total: total, id: 'contacts'}});
            if (error2) {
                logerror({type:'error', data: 'Error on user '+contact.nsid+': '+error2,spark:spark});
                callback();
            } else {
                if (flickrresults.person.revcontact == 1 || flickrresults.person.revfriend == 1 || flickrresults.person.revfamily == 1) {
                // contact is mutual
                //console.log('contact '+contact.nsid+' is mutual');
                if (!contact.mutual) {
                  console.log('updating mutual flag in db');
                  dbprovider.updatemutual(function(error4) {
                    if (error4) {
                      logerror({type:'error',data:error4,spark:spark});
                    } else{
                      updatemutual++;
                    }
                    callback();
                  },contact.nsid);
                } else {
                    callback();
                }
              } else {
                callback();
              }
              //console.log('catchall: no deletion or update');
              //callback();//null,results);
            }
          },contact.nsid);
        }, function(err) {
          spark.write({type:'progress', data: {status: 'finished', value: num, total: total, id: 'contacts'}});
          console.log('getContactInfo completed');
          if (err) {
            //something went wrong on one of the async flickr api calls
            logerror (err);
            if (typeof finished !== 'undefined') {
                finished(err);
            }
          }
          else {
            // all flickr api calls completed
            dbprovider.getLastActivity(function(error,results) {
              if (error) {
                logerror( {type:'error',data:error,spark:spark});
                if (typeof finished !== 'undefined') {
                   finished(error);
                }
              }
              else {
                if (results[0]) {
                  spark.write({type:'update', data:{lastsynccontacts: results[0].timestamp}});
                }
                if (typeof finished !== 'undefined') {
                    finished('Ok. Completed at '+results[0].timestamp);
                }
              }
            },'sync_contacts');
          }
        });
      }
    },flickrlist);    
  } // end compareresult()
  flickrprovider.getcontacts(function(error,results) {
    if (error) { logerror(error); }
    else {
      //console.log(JSON.stringify(results));
      console.log('fetching page ' + results.contacts.page + ' of ' + results.contacts.pages);
      var remainingPages = results.contacts.pages - results.contacts.page;
      if (remainingPages > 0) {
        //need to continue polling the API for all pages, lets use async
        //array to iterate over the array of remaining page numbers
        var callPage = function(id, callback) {
          if (debug) {console.debug('fetching page '+id)};
          flickrprovider.getcontacts(function(error,results) {
            if (error) {
              logerror({type:'error',data:error,spark:spark});
              callback(error,results);
            } else {
              callback(null,results);
            }
          },id);
        }
            
        async.timesSeries(remainingPages, function(n, next){
          callPage(n+2, function(err, page) {
            next(err, page);
          });
        }, function(err, pages) {
          // we should now have all pages
          fArray = results.contacts.contact;
          for (var i=0;i<pages.length;i++) {
            fArray = fArray.concat(pages[i].contacts.contact);
          }
          compareresults(fArray);
        });
      } else { // just one page of results
        compareresults(results.contacts.contact);
      }
    }
  },page);      
}


// generic table retrievement
function gettable(req,res) {
    var orderby = req.query.orderby || '';
    orderby = orderby.replace(/_/,' ');
    var options = {};
    if (req.query) {
        options = req.query;
    }
    
    var data = {table: req.params.table, options: options};//{orderby: orderby || 'timestamp DESC', limit: req.query.limit || 20, page: req.query.page || 1}};
    var callback = function(error,results) {
        if (error) {
            logerror({type:'error',data:error});
            res.status(500);
            res.render('error', { message: error, error: {} });
        } else {
            //res.render('log', { title: 'flickrbot', data: JSON.stringify(results) });
            res.send( JSON.stringify(results));
        }
    }
    dbprovider.getTable(callback,data.table,data.options);//data.orderby,data.limit,data.page);
}

function removefave(req,res) {
    var id = req.query.id;
    if (!id) {
        res.status(500);
        res.render('error', {message: 'removefave must be called with an id', error: {} });
    } else {
        flickrprovider.removefave(function(error,result) {
            if (error) {
                logerror(error);
                res.status(500);
                res.send('Error: '+error);
            } else {
                //removed from flickr, now remove from db
                util.debug('id '+id+' removed from flickr, now removing from db...');
                dbprovider.deletefave(function(error2) {
                    if (error2) {
                        logerror(error2);
                        res.status(500);
                        res.send('Error: '+error2);
                    } else {
                        util.debug('id '+id+' successfully deleted');
                        res.status(200);
                        res.send('"Ok"');
                    }
                },id);
            }
        },id);   
    }
}

function setvip (req,res) {
    var id = req.query.id;
    var value = req.query.value;
    if (!id) {
        res.status(500);
        res.render('error', {message: 'removefave must be called with an id', error: {} });
    } else {
        util.debug('setting vip status of photo id '+id+' to ' + value);
        dbprovider.setFaveVIP(function(err,result) {
            if (err) {
                logerror(err);
                res.status(500);
                res.send('Error: '+err);
                
            } else {
                util.debug('VIP status of id '+id+' set to '+value);
                res.status(200);
                res.send('"Ok"');
            }
        },id,value);
    }
}
function flickrgroups() {
    this.groups = ['34427469792@N01','38436807@N00'];
    flickrgroups.index = ++flickrgroups.index || 0;
    if (flickrgroups.index > this.groups.length - 1) {
        flickrgroups.index = 0;
    }
    return this.groups[flickrgroups.index];
}

function runupdates () {
    //broadcast activity to every connected client
    //primus.write({type: 'message', data: 'runupdates called'});
    util.log('running housekeeping...');
    synccontacts(null, function(result) {
        util.log('synccontacts completed: '+result);
        syncfaves(null, function(result) {
            util.log('syncfaves completed: '+result);
            importActivity(null, function(result) {
                util.log('importActivity completed: '+result);
                var data = {group:flickrgroups(), maxfaves: 20};
                addfaves(data,primus, function(result) {
                    util.log('addfaves completed: '+result);
                    cleanupfaves({minage: 7,maxfaves: 20}, primus, function(result) {
                        util.log('cleanupfaves completed: '+result);
                    });
                });
            });
        });
    });
    
}


