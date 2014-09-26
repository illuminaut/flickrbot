var mysql = require('mysql');
//var flickr = require('flickrapi');

/*dbprovider = function() {
    this.connection = mysql.createConnection({ 
      user: "root", 
      password: "bestlife", 
      database: "flickrbot",
      debug: false
    }); 
    this.connection.connect(function(err) {
      if (err) {
         console.log("ERROR: " + err.message);
         throw err;
      } else {
         console.log("connected!");
      }
    });
    global.myDB = this;
}*/

var db_config = {
  host: 'localhost',
    user: 'flickrbot',
    password: 'flickrbot',
    database: 'flickrbot'
};
var util = require('util');
var connection;

function mysql_real_escape_string (str) {
    return str.replace(/[\0\x08\x09\x1a\n\r"'\\\%]/g, function (char) {
        switch (char) {
            case "\0":
                return "\\0";
            case "\x08":
                return "\\b";
            case "\x09":
                return "\\t";
            case "\x1a":
                return "\\z";
            case "\n":
                return "\\n";
            case "\r":
                return "\\r";
            case "\"":
            case "'":
            case "\\":
            case "%":
                return "\\"+char; // prepends a backslash to backslash, percent,
            // and double/single quotes
        }
    });
}

dbprovider = function handleDisconnect() {
  this.connection = mysql.createConnection(db_config); // Recreate the connection, since
                                                  // the old one cannot be reused.

  this.connection.connect(function(err) {              // The server is either down
    if(err) {                                     // or restarting (takes a while sometimes).
      console.log('error when connecting to db:', err);
      setTimeout(handleDisconnect, 2000); // We introduce a delay before attempting to reconnect,
    }                                     // to avoid a hot loop, and to allow our node script to
  });                                     // process asynchronous requests in the meantime.
                                          // If you're also serving http, display a 503 error.
  this.connection.on('error', function(err) {
    console.log('db error', err);
    if(err.code === 'PROTOCOL_CONNECTION_LOST') { // Connection to the MySQL server is usually
      handleDisconnect();                         // lost due to either server restart, or a
    } else {                                      // connnection idle timeout (the wait_timeout
      throw err;                                  // server variable configures this)
    }
  });
  global.myDB  = this;
}

//dbprovider = handleDisconnect();
/***********************************************************************************************
 * Favorites
 ***********************************************************************************************/

dbprovider.findAllFaves = function(callback) {
        // get all faves from db
        global.myDB.connection.query('SELECT * FROM favorites ORDER BY dateadded DESC,id DESC', function (error, rows, fields) { 
        callback(error,rows);
      });
}

dbprovider.getFaves = function(callback,limit) {
        global.myDB.connection.query('SELECT * FROM favorites ORDER BY dateadded DESC,id DESC LIMIT '+limit, function (error, rows, fields) { 
        callback(error,rows);
      });
}

dbprovider.getFavesInterval = function(callback,interval) {
        global.myDB.connection.query('SELECT * FROM favorites WHERE dateadded > DATE_SUB(CURDATE(), INTERVAL '+interval+' DAY) ORDER BY dateadded DESC,id', function (error, rows, fields) { 
        callback(error,rows);
      });
}

dbprovider.getFavesCounts = function(callback) {
    global.myDB.connection.query('SELECT SUM(vip) AS protectedfaves, COUNT(*) AS totalfaves FROM favorites', function(error,rows,fields) {
        callback(error,rows);
    });
}

dbprovider.deletefave = function(callback, id) {
    global.myDB.connection.query('DELETE FROM favorites WHERE photoID="'+id+'"', function(error,rows,fields) {
        callback(error)
    });
}

dbprovider.getNoVipFaves = function(callback,limit,age) {
        global.myDB.connection.query('SELECT * FROM favorites WHERE vip=0 AND TIMESTAMPDIFF(DAY, `dateadded`,NOW()) >= '+age+' ORDER BY dateadded DESC,id DESC LIMIT '+limit, function (error, rows, fields) { 
        callback(error,rows);
      });
}

dbprovider.cleanupFaves = function(callback,faves) {
    if (global.debug) { console.log('cleaning up '+faves.length+' faves'); }
    async.each(faves, function(fave,callback) {
        // not implemented 
    });
}

dbprovider.importFaves = function(callback,faves) {
    if (global.debug) {console.log('importing '+faves.length+' faves'); }
    var inserted = 0, updated = 0, deleted = 0;
    async.each(faves, function(fave,callback) {
        var dateadded;
        if (fave.date_faved) {
            dateadded = 'FROM_UNIXTIME("'+fave.date_faved+'")';
        } else {
            dateadded = 'NOW()';
        }
        var sql = 'INSERT INTO favorites (photoID,ownerID,dateadded,secret,server,farm,vip) VALUES ("'+fave.id+'","'+fave.owner+'",'+dateadded+',"'+fave.secret + '","'
                + fave.server + '",' + fave.farm + ',1) ON DUPLICATE KEY UPDATE secret="'+fave.secret+'", server="'+fave.server+'", farm='+fave.farm+', dateadded='+dateadded;
        global.myDB.connection.query(sql, function(error,results) {
            if (error) {
                error.sql = sql;
                callback(error);
            } else {
                if (results.insertId) {
                    if (results.affectedRows === 1) {
                        inserted++;
                    } else if (results.affectedRows === 2) {
                        updated++;
                    }
                    //console.log('insert: '+JSON.stringify(results));
                }
                
                callback(null);
            }
        });
    }, function(err) {
        if (err) {
            console.error("ERROR: " + err.message + "\n"+err.sql);
            callback(err,faves);
        }
        else {
            util.log('processed ' + faves.length + ' faves in DB. Inserted: '+inserted+' Updated: '+updated);
            var temparray = [], flickrids = [];
            flickrids[0] = faves.reduce(function(a,b){return a.concat(b.id)},temparray);
            //console.log('IDs: '+JSON.stringify(flickrids));
            //sql = 'DELETE FROM favorites WHERE photoID NOT IN ?',flickrids;
            var query = global.myDB.connection.query('DELETE FROM favorites WHERE photoID NOT IN (?)',flickrids, function(err,results) {
                if (err) {
                    console.error(err);
                } else {
                    deleted = results.affectedRows;
                    console.log('deleted '+deleted+' rows');
                }
            });
            //io.sockets.emit('message', {message: 'deleted faves: '+deleted});
            var activity = {action: 'sync_faves', message: 'Inserted: '+inserted+', Updated: '+updated+', Deleted: '+deleted, num_affected: inserted+updated+deleted};
            dbprovider.updateActivity(function(err,result) {
                dbprovider.findAllFaves(callback);
            }, activity);
            
            //dbprovider.findAllFaves(callback);
        }      
    });
}


dbprovider.addFave = function(callback,photo) {
    // add fave to the db
    if (!photo) {
        callback('Error: Second parameter of addFave needs to be photo',null);
    } else {
        //console.log('importing photos: '+JSON.stringify(photos, null, 4));
        var reterror;
        //console.log('inserting photo '+photo.id);
        var sql = "INSERT INTO favorites (photoID,ownerID,secret,server,farm) VALUES ('"+photo.id+"','"+photo.owner+"','"+photo.secret+"','"+photo.server+"',"+photo.farm+") ";
        //console.log(sql);
        global.myDB.connection.query(sql, function (error, rows, fields) {
            //callback(error,rows);
            if (error) {
               console.log("ERROR: " + error.message);
               
               reterror = error;
            }
        });
        /*$sql = "INSERT INTO favorites (photoID,ownerID,secret,server,farm) VALUES ('".$photo['id']."','".$photo['owner']."','".$photo['secret']."','".$photo['server']."',".$photo['farm'].") "
            . "ON DUPLICATE KEY UPDATE secret='".$photo['secret']."',server='".$photo['server']."',farm=".$photo['farm'].";";*/
        //global.myDB.connection.query('INSERT INTO favorites (photoID,ownerID,secret,server,farm) VALUES ('+)
        callback(reterror,'Ok');
    }
} 
dbprovider.addFaves = function(callback,photos) {
    // add faves to the db
    if (!photos) {
        callback('Error: Second parameter of addFave needs to be photos',null);
    } else {
        var reterror;
        photos.forEach(function (photo) {
            if(photo.stop){ return; }
            //console.log('inserting photo '+photo.id);
            var sql = "INSERT INTO favorites (photoID,ownerID,secret,server,farm) VALUES ('"+photo.id+"','"+photo.owner+"','"+photo.secret+"','"+photo.server+"',"+photo.farm+") ";
            //console.log(sql);
            global.myDB.connection.query(sql, function (error, rows, fields) {
                //callback(error,rows);
                if (error) {
                   console.log("ERROR: " + error.message);
                   photo.stop = true;
                   reterror = error;
                }
            });
        });
        callback(reterror,'Ok');
    }
}

dbprovider.setFaveVIP = function(callback,id,value) {
    // set VIP flag of specified favorite
    if (typeof value === 'undefined') {
      value = 1;
    }
    if (!id) {
        callback('Error: second parameter of setFaveVIP needs to be favorite ID',null);
    } else {
        var reterror;
        var sql = "UPDATE favorites SET vip = "+value+" WHERE photoID = '" + id + "'";
        global.myDB.connection.query(sql, function (error, rows, fields) {
            if (error) {
                console.log("ERROR: " + error.message);
                reterror = error;
            }
        });
        callback(reterror,'Ok');
    }
}
/***********************************************************************************************
 * Contacs
 ***********************************************************************************************/

dbprovider.findAllContacts = function(callback) {
      // get all faves from db
      global.myDB.connection.query('SELECT * FROM contacts ORDER BY id', function (error, rows, fields) { 
        callback(error,rows);
      });
}

dbprovider.getContacts = function(callback,limit) {
        // get all contacts from db
        global.myDB.connection.query('SELECT * FROM contacts ORDER BY id DESC LIMIT 0,'+limit, function (error, rows, fields) { 
        callback(error,rows);
      });
}

dbprovider.getContactCounts = function(callback) {
    global.myDB.connection.query('SELECT SUM(mutual) AS mutualcontacts, COUNT(*) AS totalcontacts FROM contacts', function(error,rows,fields) {
        //console.log(JSON.stringify(fields) + ' | ' + JSON.stringify(rows));
        callback(error,rows);
    });
}

dbprovider.deletecontact = function(callback, id) {
    global.myDB.connection.query('DELETE FROM contacts WHERE nsid="'+id+'"', function(error,rows,fields) {
        callback(error)
    });
}

dbprovider.importContacts2 = function(callback, contacts) {
    var reterror,contact;
    //console.log('total: '+contacts.total + ', array length: '+contacts.contact.length);
    
    async.eachSeries(contacts, function(contact, callback) {
        var username = mysql_real_escape_string(contact.username);
        var sql = 'INSERT INTO contacts (nsid,username,iconfarm,iconserver) VALUES ("'+contact.nsid+'","'+username+'",'+contact.iconfarm+',"'+contact.iconserver+'")'
                + ' ON DUPLICATE KEY UPDATE username="'+username+'", iconfarm='+contact.iconfarm+', iconserver="'+contact.iconserver+'"';
        global.myDB.connection.query(sql, function(error,rows,fields) {
            if (error) error.sql = sql;
            callback(error);
        });
    }, function(err) {
        if (err) {
            console.error("ERROR: " + err.message + "\n"+err.sql);
            callback(err,contacts);
        }
        else {
            //console.log('updated ' + contacts.length + ' contacts');
            //return updated list of contacts
            //dbprovider.findAllContacts(callback);
            global.myDB.connection.query('SELECT * FROM contacts ORDER BY id', function (error, rows, fields) { 
              callback(error,rows);
            });
        }
    });
}
dbprovider.importContacts = function(callback, contacts) {
    var reterror,contact;
    var inserted = 0, updated = 0, deleted = 0, mutual = 0;

    //console.log('total: '+contacts.total + ', array length: '+contacts.contact.length);
    util.debug('Importing contacts. total: '+contacts.total + ', array length: '+contacts.length);
    async.each(contacts, function(contact, callback) {
        var username = mysql_real_escape_string(contact.username);
        var sql = 'INSERT INTO contacts (nsid,username,iconfarm,iconserver) VALUES ("'+contact.nsid+'","'+username+'",'+contact.iconfarm+',"'+contact.iconserver+'")'
                + ' ON DUPLICATE KEY UPDATE username="'+username+'", iconfarm='+contact.iconfarm+', iconserver="'+contact.iconserver+'"';
        global.myDB.connection.query(sql, function(error,rows,fields) {
            if (error) {
              error.sql = sql;
              callback(error);
            } else {
              if (rows.insertId) {
                if (rows.affectedRows === 1) {
                  inserted++;
                } else if (rows.affectedRows === 2) {
                  updated++;
                }
              }
              callback();             
            }
        });
    }, function(err) {
        if (err) {
            console.error("ERROR: " + err.message + "\n"+err.sql);
            callback(err,null);
        }
        else {
            //console.log('updated ' + contacts.length + ' contacts');
            util.debug('processed ' + contacts.length + ' contacts in DB. Inserted: '+inserted + ', Updated: '+updated);
            // now delete contacts from db that are not part of flickr contacts.
            var temparray = [], flickrids = [];
            // provide a flat list of just the IDs from the flickr contacts
            flickrids[0] = contacts.reduce(function(a,b){return a.concat(b.nsid)},temparray);
            var query = global.myDB.connection.query('DELETE FROM contacts WHERE nsid NOT IN (?)',flickrids, function(err,results) {
                //util.debug(util.inspect(query.sql));
                if (err) {
                    console.error(err);
                } else {
                    deleted = results.affectedRows;
                    console.log('finished importing contacts. inserted: '+inserted+', updated: '+updated+', deleted: '+deleted+' rows');
                    dbprovider.updateActivity(function(error2,results2) {
                      if (error2) {
                        callback(error2,null);
                      } else {
                        global.myDB.connection.query('SELECT * FROM contacts ORDER BY id', function (error, rows, fields) { 
                          callback(error,rows);
                        });
                      }
                    },{action:'sync_contacts',num_affected: (inserted+updated+deleted), message: 'Inserted: '+inserted+', Updated: '+updated+', Deleted: '+deleted})
                }
                
            });            
            //return updated list of contacts
            //dbprovider.findAllContacts(callback);
           //global.myDB.connection.query('SELECT * FROM contacts ORDER BY id', function (error, rows, fields) { 
           //   callback(error,rows);
           // });
        }
    });
}
dbprovider.updatemutual = function(callback,id) {
    if (!id) {
        console.error('updatemutual must be called with an id');
    } else {
        var sql = 'UPDATE contacts SET mutual=1 WHERE nsid="'+id+'"';
        global.myDB.connection.query(sql, function(error,rows,fields) {
            callback(error,rows);
        });
    }
}

/***********************************************************************************************
 * Activity
 ***********************************************************************************************/

dbprovider.importActivity = function(callback,items) {
    if (!items.item) {
        callback('no item found in activity',null);
    } else {
        var sql = '', eventcnt = 0, insertedrows = 0;
        async.each(items.item, function(item,callback) {
            
        //}
        //for(var i=0; i<items.item.length; i++) {
            sql = 'INSERT IGNORE INTO `activity` (`event`,`user`,`username`,`dateadded`,`photoID`,`content`) VALUES ';
            for(var j=0; j<item.activity.event.length; j++) {
                eventcnt++;
                var evt = item.activity.event[j];
                var data= evt._content || evt.group_name;
                sql = sql + '("'+evt.type+'","'+evt.user+'","'+mysql_real_escape_string(evt.username)+'",FROM_UNIXTIME('+evt.dateadded+'),"'+item.id+'",';
                if (data) {
                    sql = sql + '"' + mysql_real_escape_string(data) + '")';
                } else {
                    sql = sql + 'NULL)'
                }
                if (j < item.activity.event.length - 1) {
                    sql = sql + ',';
                }
            }
            //console.log(sql);
            global.myDB.connection.query(sql, function(error,results) {
                if (error) {
                    error.sql = sql;
                    callback(error);
                }
                else {
                    insertedrows = insertedrows + results.affectedRows;
                    callback(null);
                }
            });
            
        }, function(err) {
            if (err) {
                callback(err,null);
            } else {
                callback(null,insertedrows);
            }
        });
    }
}
dbprovider.getLastActivity = function(callback,action) {
    global.myDB.connection.query('SELECT timestamp,num_affected,message,UNIX_TIMESTAMP(timestamp) AS `unixtime` FROM activitylog WHERE action = \''+action+'\' ORDER BY timestamp DESC LIMIT 1', function(error,rows,fields) {
        callback(error,rows);
    });
}

dbprovider.getTable = function(callback,table,options){//orderby,limit,page){
  var limitrange;
  var orderby = '', limit = '';
  if (!options.page || options.page == 1) {
    limitrange = options.limit;
  } else if (options.page > 1){
    limitrange = ((options.page - 1) * options.limit) + ',' + ((options.page * options.limit) - 1);  
  }
  if (options.limit) {
    limit = ' LIMIT ' + limitrange;
  }
  if (options.orderby) {
    orderby = ' ORDER BY '+options.orderby;
  }
  global.myDB.connection.query('SELECT * FROM '+table+orderby+limit, function(error,rows,fields) {
    callback(error,rows);
  });
}

dbprovider.updateActivity = function(callback,activity) {
    if (activity.message) {
        var query = global.myDB.connection.query('INSERT INTO activitylog SET ?',activity, function(err,result) {
            if (err) {
                console.log("ERROR: "+err.message + ' | SQL: '+ query.sql);
                err.sql = query.sql;
                callback(err,activity);
            } else {
                callback(null,result);
            }
        });
    } else {
        var error = "second parameter in updateActivity must be object";
        callback(error,activity);
    }
    /*var sql = 'INSERT INTO activitylog (action) VALUES (\''+action+'\')';
    //console.log(sql);
    global.myDB.connection.query(sql, function(error,rows,fields) {
        if (error) {
               console.log("ERROR: " + error.message);
               callback(error,action);
               
            }
        //console.log(JSON.stringify(fields) + ' | ' + JSON.stringify(rows));
        callback(null,rows);
    });*/
}

dbprovider.updateVipStatus = function(callback) {
    //var sql = 'UPDATE `favorites` fav SET fav.vip=1 FROM `activity` act WHERE act.dateadded > (SELECT `timestamp` FROM `activitylog` log WHERE log.action = "add_faves" ORDER BY log.timestamp DESC LIMIT 1) AND fav.ownerID = act.user';
    var sql = 'UPDATE favorites f INNER JOIN activity a ON f.ownerID = a.user SET f.vip=1';// WHERE f.vip=0';
    global.myDB.connection.query(sql,function(err,result) {
        if (err) {
            err.sql = sql;
        }
        callback(err,result.changedRows);
    });
}


exports.dbprovider = dbprovider;
